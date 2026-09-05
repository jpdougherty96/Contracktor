import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  categories,
  getMissingReceiptIdentityFields,
  getReceiptErrorMessage,
  getReceiptStatus,
  hasReceiptTotalDiscrepancy,
  lineItemsDoNotExceedReceiptTotal,
  lineItemCategories,
  lineTypes,
  maxReceiptLineItems,
  normalizeExtraction,
  normalizeReceiptDate,
  toMoney,
} from './receipt-normalization.ts';

export type ReceiptProcessingResult = {
  line_items?: unknown[];
  receipt: unknown;
};

export async function processReceiptImage(
  supabase: ReturnType<typeof createClient>,
  {
    receiptId,
    processingLeaseId,
    expectedOwnerId,
    openAiApiKey,
    openAiModel,
    throwOnFailure = false,
  }: {
    receiptId: string;
    processingLeaseId: string;
    expectedOwnerId?: string;
    openAiApiKey: string;
    openAiModel: string;
    throwOnFailure?: boolean;
  }
): Promise<ReceiptProcessingResult> {
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('id, owner_id, scan_context_job_id, storage_path, processing_status, processing_lease_id, status')
    .eq('id', receiptId)
    .single();

  if (receiptError || !receipt) {
    throw new Error(receiptError?.message ?? 'Receipt not found');
  }

  if (expectedOwnerId && receipt.owner_id !== expectedOwnerId) {
    throw new Error('Receipt does not belong to authenticated user');
  }

  if (receipt.status === 'accepted' || receipt.status === 'voided') {
    return { receipt };
  }

  if (processingLeaseId && receipt.processing_lease_id !== processingLeaseId) {
    return { receipt };
  }

  if (!receipt.storage_path) {
    const updatedReceipt = await markNeedsReview(
      supabase,
      receipt.id,
      'Receipt does not have a storage path.',
      processingLeaseId
    );
    return { receipt: updatedReceipt };
  }

  try {
    const { data: imageBlob, error: downloadError } = await supabase.storage
      .from('receipts')
      .download(receipt.storage_path);

    if (downloadError || !imageBlob) {
      throw new Error(downloadError?.message ?? 'Unable to download receipt image.');
    }

    const imageBase64 = arrayBufferToBase64(await imageBlob.arrayBuffer());
    const contentType = imageBlob.type || 'image/jpeg';
    const extraction = await extractWithOpenAI(openAiApiKey, openAiModel, imageBase64, contentType);
    let normalized = normalizeExtraction(extraction);

    if (
      !lineItemsDoNotExceedReceiptTotal(normalized) ||
      hasReceiptTotalDiscrepancy(normalized)
    ) {
      const retryExtraction = await extractWithOpenAI(
        openAiApiKey,
        openAiModel,
        imageBase64,
        contentType,
        true
      );
      const retryNormalized = normalizeExtraction(retryExtraction);

      if (
        lineItemsDoNotExceedReceiptTotal(retryNormalized) &&
        !hasReceiptTotalDiscrepancy(retryNormalized) &&
        retryNormalized.line_items.length > 0
      ) {
        normalized = retryNormalized;
      }
    }

    normalized = await recoverMissingReceiptIdentity(
      openAiApiKey,
      openAiModel,
      imageBase64,
      contentType,
      normalized
    );

    const extractionStatus = getReceiptStatus(normalized);
    const status =
      extractionStatus === 'accepted' && normalized.line_items.length > 0
        ? 'needs_review'
        : extractionStatus;
    const reviewStatus = getProcessedReceiptReviewStatus({
      legacyStatus: status,
      scanContextJobId: receipt.scan_context_job_id,
    });
    const errorMessage = getReceiptErrorMessage(status, normalized);

    const { data: persisted, error: persistError } = await supabase.rpc(
      'persist_receipt_extraction',
      {
        p_error_message: errorMessage,
        p_extraction: normalized,
        p_processing_lease_id: processingLeaseId,
        p_receipt_id: receipt.id,
        p_review_status: reviewStatus,
        p_status: status,
      }
    );

    if (persistError || !persisted || typeof persisted !== 'object') {
      throw new Error(persistError?.message ?? 'Unable to save receipt extraction.');
    }

    const result = persisted as { line_items?: unknown[]; receipt?: unknown };

    if (!result.receipt) {
      throw new Error('Receipt extraction persistence returned no receipt.');
    }

    return {
      line_items: Array.isArray(result.line_items) ? result.line_items : [],
      receipt: result.receipt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Receipt extraction failed.';
    const updatedReceipt = await markNeedsReview(
      supabase,
      receipt.id,
      errorMessage,
      processingLeaseId
    );

    if (throwOnFailure) {
      throw new Error(errorMessage);
    }

    return { receipt: updatedReceipt };
  }
}

function getProcessedReceiptReviewStatus({
  legacyStatus,
  scanContextJobId,
}: {
  legacyStatus: string;
  scanContextJobId: string | null;
}): string {
  if (legacyStatus === 'error') {
    return 'error';
  }

  if (!scanContextJobId) {
    return 'needs_destination';
  }

  return legacyStatus === 'accepted' ? 'reviewed' : 'needs_review';
}

async function extractWithOpenAI(
  apiKey: string,
  model: string,
  imageBase64: string,
  contentType: string,
  isReconciliationRetry = false
): Promise<unknown> {
  const retryInstruction = isReconciliationRetry
    ? ' This is a retry because the previous line items did not reconcile to the visible receipt total. Re-read the printed right-side extended amounts carefully, look for rebate, coupon, discount, store credit, or credit adjustment rows, return those adjustment rows as line_type discount when visible, and exclude summary/tax/payment rows.'
    : '';
  const extractionInstructions =
    `You are extracting data from a contractor receipt photo. Return only valid JSON. If the receipt is shown inside a phone screenshot, email, browser, or app screen, ignore the surrounding UI and read only the receipt itself. Extract vendor, receipt_date in YYYY-MM-DD if visible, subtotal, tax, total, likely receipt category, confidence from 0 to 1, notes, and visible purchased line items. The top-level total must be the final out-of-pocket amount paid after every rebate, coupon, discount, store credit, or credit adjustment. If the receipt prints both a gross TOTAL and a lower AMOUNT PAID, BALANCE DUE, NET TOTAL, or GRAND TOTAL after an adjustment, use the lower final paid amount as total. Use issue date, transaction date, order date, or receipt date as receipt_date when a standard receipt date label is not present. For line_items, include purchased products/services and visible rebate, coupon, discount, store credit, or credit adjustment rows. Rebate, coupon, discount, store credit, and credit adjustment rows must use line_type discount with a positive line_total amount. Important: do not net a rebate, credit, or discount into a purchased item line. Preserve the printed gross item extended amount as an item line, and preserve the rebate/credit/discount as its own discount line. Amounts printed with a trailing minus sign, such as 299.57-, are discount/credit amounts and should be returned as positive line_total with line_type discount. Menards receipts often show MENARD REBATE or rebate receipt rows; include those rows as line_type discount when they affect the subtotal or amount paid. Never include subtotal, taxes, taxes and fees, total, ticket amount, payment, card authorization, remaining balance, survey, cashier, transaction number, address, phone, return policy, or other non-purchase/summary rows as item line_items. If itemized taxes or fees are visible and there is no separate tax total, sum those tax/fee rows into the top-level tax value. Preserve original_text exactly as visible, write a cleaned_name that expands abbreviations when clear, and do not invent invisible items. Do not bake tax into item prices. The sum of item line totals minus discount line totals plus tax should reconcile to the final out-of-pocket total when discount rows are present. If a quantity/unit price is visible, use the extended line amount printed at the right, not quantity times a misread unit price. Category must be one of: materials, tools, fuel, subcontractor, permit, other. Line item category must be one of: material, tool, inventory, rental, permit, subcontractor, fuel, other, or null. Line type must be item for purchased rows and discount for rebate, coupon, discount, store credit, or credit adjustment rows; use tax or fee only if such a row is unavoidable, and tax/fee rows will be ignored by conTRACKtor. If the receipt date is not visible, set receipt_date to null and include the exact phrase "date not visible" in notes.${retryInstruction}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [
        {
          content: [
            {
              text: extractionInstructions,
              type: 'input_text',
            },
            {
              image_url: `data:${contentType};base64,${imageBase64}`,
              type: 'input_image',
            },
          ],
          role: 'user',
        },
      ],
      model,
      text: {
        format: {
          name: 'receipt_extraction',
          schema: {
            additionalProperties: false,
            properties: {
              category: {
                enum: [...categories, null],
              },
              confidence: {
                maximum: 1,
                minimum: 0,
                type: 'number',
              },
              notes: {
                type: ['string', 'null'],
              },
                  line_items: {
                    type: 'array',
                    maxItems: maxReceiptLineItems,
                    items: {
                  additionalProperties: false,
                  properties: {
                    category: {
                      enum: [...lineItemCategories, null],
                    },
                    cleaned_name: {
                      type: 'string',
                    },
                    confidence: {
                      maximum: 1,
                      minimum: 0,
                      type: 'number',
                    },
                    line_number: {
                      type: 'number',
                    },
                    line_total: {
                      type: ['number', 'string', 'null'],
                    },
                    line_type: {
                      enum: lineTypes,
                    },
                    original_text: {
                      type: 'string',
                    },
                    quantity: {
                      type: ['number', 'string', 'null'],
                    },
                    unit_price: {
                      type: ['number', 'string', 'null'],
                    },
                  },
                  required: [
                    'line_number',
                    'original_text',
                    'cleaned_name',
                    'quantity',
                    'unit_price',
                    'line_total',
                    'line_type',
                    'category',
                    'confidence',
                  ],
                  type: 'object',
                },
              },
              receipt_date: {
                type: ['string', 'null'],
              },
              subtotal: {
                type: ['number', 'null'],
              },
              tax: {
                type: ['number', 'null'],
              },
              total: {
                type: ['number', 'null'],
              },
              vendor: {
                type: ['string', 'null'],
              },
            },
            required: [
              'vendor',
              'receipt_date',
              'subtotal',
              'tax',
              'total',
              'category',
              'confidence',
              'notes',
              'line_items',
            ],
            type: 'object',
          },
          strict: true,
          type: 'json_schema',
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI extraction failed: ${errorText}`);
  }

  const data = await response.json();
  const outputText = getResponseOutputText(data);

  if (!outputText) {
    throw new Error('OpenAI extraction returned no JSON.');
  }

  return JSON.parse(outputText);
}

async function recoverMissingReceiptIdentity(
  apiKey: string,
  model: string,
  imageBase64: string,
  contentType: string,
  extraction: ReturnType<typeof normalizeExtraction>
): Promise<ReturnType<typeof normalizeExtraction>> {
  const missingFields = getMissingReceiptIdentityFields(extraction);

  if (missingFields.length === 0) {
    return extraction;
  }

  try {
    const recovered = await extractReceiptIdentityWithOpenAI(
      apiKey,
      model,
      imageBase64,
      contentType,
      missingFields,
      extraction
    );
    const value = recovered && typeof recovered === 'object'
      ? recovered as Record<string, unknown>
      : {};
    const recoveredVendor = typeof value.vendor === 'string'
      ? value.vendor.trim() || null
      : null;

    return normalizeExtraction({
      ...extraction,
      receipt_date: extraction.receipt_date ?? normalizeReceiptDate(value.receipt_date),
      total: extraction.total ?? toMoney(value.total),
      vendor: extraction.vendor ?? recoveredVendor,
    });
  } catch (error) {
    console.warn(
      'Targeted receipt identity recovery failed.',
      error instanceof Error ? error.message : 'Unknown recovery error.'
    );
    return extraction;
  }
}

async function extractReceiptIdentityWithOpenAI(
  apiKey: string,
  model: string,
  imageBase64: string,
  contentType: string,
  missingFields: string[],
  extraction: ReturnType<typeof normalizeExtraction>
): Promise<unknown> {
  const instructions =
    `Re-inspect this entire receipt image for missing required data. The first pass missed: ${missingFields.join(', ')}. ` +
    'Look carefully at the receipt header and the bottom/footer, including small text after the cashier, authorization, or thank-you section. ' +
    'For receipt_date, use the printed transaction, sale, issue, order, or purchase date. Ignore return-policy deadlines, rebate expiration dates, and other future dates. ' +
    'Return null when a value truly is not printed; do not guess. Return receipt_date as YYYY-MM-DD. ' +
    `The reliable first-pass values were vendor=${JSON.stringify(extraction.vendor)} and total=${JSON.stringify(extraction.total)}. ` +
    'Return only valid JSON.';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [
        {
          content: [
            {
              text: instructions,
              type: 'input_text',
            },
            {
              image_url: `data:${contentType};base64,${imageBase64}`,
              type: 'input_image',
            },
          ],
          role: 'user',
        },
      ],
      model,
      text: {
        format: {
          name: 'receipt_identity_recovery',
          schema: {
            additionalProperties: false,
            properties: {
              date_evidence: {
                type: ['string', 'null'],
              },
              receipt_date: {
                type: ['string', 'null'],
              },
              total: {
                type: ['number', 'null'],
              },
              vendor: {
                type: ['string', 'null'],
              },
            },
            required: ['vendor', 'receipt_date', 'total', 'date_evidence'],
            type: 'object',
          },
          strict: true,
          type: 'json_schema',
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI identity recovery failed: ${errorText}`);
  }

  const outputText = getResponseOutputText(await response.json());

  if (!outputText) {
    throw new Error('OpenAI identity recovery returned no JSON.');
  }

  return JSON.parse(outputText);
}

async function markNeedsReview(
  supabase: ReturnType<typeof createClient>,
  receiptId: string,
  errorMessage: string,
  processingLeaseId?: string
) {
  let updateQuery = supabase
    .from('receipts')
    .update({
      error_message: errorMessage,
      last_processing_error: errorMessage,
      processing_status: 'failed',
      processing_lease_id: null,
      processing_started_at: null,
      review_status: 'needs_review',
      status: 'needs_review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptId)
    .not('status', 'in', '(accepted,voided)');

  if (processingLeaseId) {
    updateQuery = updateQuery.eq('processing_lease_id', processingLeaseId);
  }

  const { data, error } = await updateQuery
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? fetchCurrentReceipt(supabase, receiptId);
}

async function fetchCurrentReceipt(
  supabase: ReturnType<typeof createClient>,
  receiptId: string
) {
  const { data, error } = await supabase
    .from('receipts')
    .select()
    .eq('id', receiptId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Receipt not found.');
  }

  return data;
}

function getResponseOutputText(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const response = data as { output_text?: unknown; output?: unknown };

  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return null;
  }

  for (const item of response.output) {
    if (!item || typeof item !== 'object' || !Array.isArray((item as { content?: unknown }).content)) {
      continue;
    }

    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
        return (content as { text: string }).text;
      }
    }
  }

  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}
