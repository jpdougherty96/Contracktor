import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const categories = ['materials', 'tools', 'fuel', 'subcontractor', 'permit', 'other'] as const;
const lineItemCategories = [
  'material',
  'tool',
  'inventory',
  'rental',
  'permit',
  'subcontractor',
  'fuel',
  'other',
] as const;
const lineTypes = ['item', 'tax', 'fee', 'discount'] as const;
const confidenceThreshold = 0.75;
const lineItemConfidenceThreshold = 0.6;
const receiptMathTolerance = 0.05;
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey =
    req.headers.get('apikey') ??
    getFirstPublishableKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')) ??
    Deno.env.get('SUPABASE_ANON_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const openAiModel = Deno.env.get('OPENAI_RECEIPT_MODEL') ?? 'gpt-5.4-mini';

  if (!supabaseUrl || !supabaseKey || !openAiApiKey) {
    return jsonResponse({ error: 'Missing Edge Function secrets' }, 500);
  }

  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authenticated user token' }, 401);
  }

  const receiptId = await readReceiptId(req);

  if (!receiptId) {
    return jsonResponse({ error: 'receipt_id is required' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
  const jwt = authorization.replace('Bearer ', '');
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: userError?.message ?? 'Invalid user token' }, 401);
  }

  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('id, owner_id, scan_context_job_id, storage_path')
    .eq('id', receiptId)
    .single();

  if (receiptError || !receipt) {
    const isPermissionError = receiptError?.message?.includes('permission denied');

    return jsonResponse(
      { error: receiptError?.message ?? 'Receipt not found' },
      isPermissionError ? 500 : 404
    );
  }

  if (receipt.owner_id !== user.id) {
    return jsonResponse({ error: 'Receipt does not belong to authenticated user' }, 403);
  }

  if (!receipt.storage_path) {
    const updatedReceipt = await markNeedsReview(
      supabase,
      receipt.id,
      'Receipt does not have a storage path.'
    );
    return jsonResponse({ receipt: updatedReceipt });
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

    if (!lineItemsDoNotExceedReceiptTotal(normalized)) {
      const retryExtraction = await extractWithOpenAI(
        openAiApiKey,
        openAiModel,
        imageBase64,
        contentType,
        true
      );
      const retryNormalized = normalizeExtraction(retryExtraction);

      if (lineItemsDoNotExceedReceiptTotal(retryNormalized) && retryNormalized.line_items.length > 0) {
        normalized = retryNormalized;
      }
    }

    const extractionStatus = getReceiptStatus(normalized);
    const status =
      extractionStatus === 'accepted' && normalized.line_items.length > 0
        ? 'needs_review'
        : extractionStatus;
    const errorMessage = getReceiptErrorMessage(status, normalized);

    const { data: updatedReceipt, error: updateError } = await supabase
      .from('receipts')
      .update({
        ai_confidence: normalized.confidence,
        category: normalized.category,
        error_message: errorMessage,
        extracted_json: normalized,
        receipt_date: normalized.receipt_date,
        review_status: status === 'accepted' ? 'reviewed' : status,
        status,
        subtotal: normalized.subtotal,
        tax: normalized.tax,
        total: normalized.total,
        updated_at: new Date().toISOString(),
        vendor: normalized.vendor,
      })
      .eq('id', receipt.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const lineItems = await replaceDraftLineItems(supabase, {
      ownerId: user.id,
      receiptId: receipt.id,
      scanContextJobId: receipt.scan_context_job_id,
      status,
      lineItems: normalized.line_items,
    });

    return jsonResponse({ receipt: updatedReceipt, line_items: lineItems });
  } catch (error) {
    const updatedReceipt = await markNeedsReview(
      supabase,
      receipt.id,
      error instanceof Error ? error.message : 'Receipt extraction failed.'
    );
    return jsonResponse({ receipt: updatedReceipt });
  }
});

async function readReceiptId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    return typeof body.receipt_id === 'string' ? body.receipt_id : null;
  } catch {
    return null;
  }
}

async function extractWithOpenAI(
  apiKey: string,
  model: string,
  imageBase64: string,
  contentType: string,
  isReconciliationRetry = false
): Promise<unknown> {
  const retryInstruction = isReconciliationRetry
    ? ' This is a retry because the previous line items exceeded the visible receipt total. Re-read the printed right-side extended amounts carefully, exclude summary/tax/payment rows, and return fewer line items if needed rather than making the item total exceed the receipt total.'
    : '';
  const extractionInstructions =
    `You are extracting data from a contractor receipt photo. Return only valid JSON. If the receipt is shown inside a phone screenshot, email, browser, or app screen, ignore the surrounding UI and read only the receipt itself. Extract vendor, receipt_date in YYYY-MM-DD if visible, subtotal, tax, total, likely receipt category, confidence from 0 to 1, notes, and visible purchased line items. Use issue date, transaction date, order date, or receipt date as receipt_date when a standard receipt date label is not present. For line_items, include purchased products/services only. Never include subtotal, taxes, taxes and fees, fees, total, ticket amount, payment, card, authorization, survey, cashier, transaction number, address, phone, return policy, or other non-purchase/summary rows as item line_items. If itemized taxes or fees are visible and there is no separate tax total, sum those tax/fee rows into the top-level tax value. Preserve original_text exactly as visible, write a cleaned_name that expands abbreviations when clear, and do not invent invisible items. Do not bake tax into item prices. The sum of item line totals plus tax must never exceed the visible receipt total; if a quantity/unit price is visible, use the extended line amount printed at the right, not quantity times a misread unit price. Category must be one of: materials, tools, fuel, subcontractor, permit, other. Line item category must be one of: material, tool, inventory, rental, permit, subcontractor, fuel, other, or null. Line type must be item for purchased rows; use tax, fee, or discount only if such a row is unavoidable, and those rows will be ignored by conTRACKtor. If the receipt date is not visible, set receipt_date to null and include the exact phrase "date not visible" in notes.${retryInstruction}`;

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

function normalizeExtraction(extraction: unknown) {
  const value = extraction && typeof extraction === 'object' ? extraction as Record<string, unknown> : {};
  const category = typeof value.category === 'string' && isCategory(value.category)
    ? value.category
    : null;
  const notes = typeof value.notes === 'string' ? value.notes : null;
  const receiptDate = typeof value.receipt_date === 'string' ? value.receipt_date : null;
  const parsedTotal = toMoney(value.total);
  const parsedTax = toMoney(value.tax);
  const taxFromLines = sumRawLineTotals(value.line_items, ['tax', 'fee']);
  const tax = parsedTax ?? taxFromLines;
  const parsedSubtotal = toMoney(value.subtotal);
  const subtotal =
    parsedSubtotal ??
    (typeof parsedTotal === 'number' && typeof tax === 'number'
      ? Math.round((parsedTotal - tax) * 100) / 100
      : null);

  return {
    category,
    confidence: typeof value.confidence === 'number' ? value.confidence : 0,
    notes,
    receipt_date: receiptDate,
    subtotal,
    tax,
    total: parsedTotal,
    vendor: typeof value.vendor === 'string' ? value.vendor.trim() || null : null,
    line_items: normalizeLineItems(value.line_items),
  };
}

function getReceiptStatus(extraction: ReturnType<typeof normalizeExtraction>) {
  const hasUsableReceiptIdentity =
    Boolean(extraction.vendor) &&
    Boolean(extraction.receipt_date) &&
    typeof extraction.total === 'number' &&
    extraction.total > 0;

  if (!hasUsableReceiptIdentity) {
    return 'error';
  }

  const hasRequiredFields =
    Boolean(extraction.vendor) &&
    Boolean(extraction.category) &&
    Boolean(extraction.receipt_date) &&
    typeof extraction.total === 'number' &&
    extraction.total > 0 &&
    extraction.line_items.length > 0 &&
    extraction.line_items.every(
      (lineItem) =>
        lineItem.confidence === null || lineItem.confidence >= lineItemConfidenceThreshold
    ) &&
    receiptMathReconciles(extraction) &&
    lineItemsDoNotExceedReceiptTotal(extraction);

  return hasRequiredFields && extraction.confidence >= confidenceThreshold
    ? 'accepted'
    : 'needs_review';
}

function getReceiptErrorMessage(
  status: string,
  extraction?: ReturnType<typeof normalizeExtraction>
): string | null {
  if (status === 'accepted') {
    return null;
  }

  if (status === 'error') {
    return "We couldn't read the vendor, date, and total from this receipt. Please retake a clearer photo.";
  }

  if (extraction && !lineItemsDoNotExceedReceiptTotal(extraction)) {
    return 'Parsed line items add up to more than the receipt total. Review the receipt lines before saving.';
  }

  return 'Some receipt details need review before this can be accepted.';
}

function receiptMathReconciles(extraction: ReturnType<typeof normalizeExtraction>): boolean {
  if (
    typeof extraction.subtotal !== 'number' ||
    typeof extraction.tax !== 'number' ||
    typeof extraction.total !== 'number'
  ) {
    return true;
  }

  return Math.abs(extraction.subtotal + extraction.tax - extraction.total) <= receiptMathTolerance;
}

function lineItemsDoNotExceedReceiptTotal(extraction: ReturnType<typeof normalizeExtraction>): boolean {
  if (typeof extraction.total !== 'number' || extraction.line_items.length === 0) {
    return true;
  }

  const itemTotal = extraction.line_items
    .filter((lineItem) => lineItem.line_type === 'item')
    .reduce((sum, lineItem) => sum + lineItem.line_total, 0);
  const tax = typeof extraction.tax === 'number' ? extraction.tax : 0;

  return itemTotal + tax <= extraction.total + receiptMathTolerance;
}

function isCategory(value: string): value is typeof categories[number] {
  return categories.includes(value as typeof categories[number]);
}

function isLineItemCategory(value: string): value is typeof lineItemCategories[number] {
  return lineItemCategories.includes(value as typeof lineItemCategories[number]);
}

function isLineType(value: string): value is typeof lineTypes[number] {
  return lineTypes.includes(value as typeof lineTypes[number]);
}

function toMoney(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value.replace(/[$,\s]/g, ''));

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeLineItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => normalizeLineItem(item, index + 1))
    .filter((item): item is NonNullable<ReturnType<typeof normalizeLineItem>> => item !== null);
}

function sumRawLineTotals(value: unknown, types: string[]): number | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const total = value.reduce((sum, item) => {
    if (!item || typeof item !== 'object') {
      return sum;
    }

    const rawLine = item as Record<string, unknown>;
    const lineType = typeof rawLine.line_type === 'string' ? rawLine.line_type : null;
    const lineTotal = toMoney(rawLine.line_total);

    if (!lineType || !types.includes(lineType) || lineTotal === null) {
      return sum;
    }

    return sum + Math.abs(lineTotal);
  }, 0);

  return total > 0 ? Math.round(total * 100) / 100 : null;
}

function normalizeLineItem(value: unknown, fallbackLineNumber: number) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const lineTotal = toMoney(item.line_total);
  const originalText = typeof item.original_text === 'string' ? item.original_text.trim() : '';
  const cleanedName = typeof item.cleaned_name === 'string' ? item.cleaned_name.trim() : '';

  if (!cleanedName || lineTotal === null) {
    return null;
  }

  const lineType = typeof item.line_type === 'string' && isLineType(item.line_type)
    ? item.line_type
    : 'item';

  if (lineType !== 'item' || isReceiptSummaryLine(cleanedName) || isReceiptSummaryLine(originalText)) {
    return null;
  }

  const category = typeof item.category === 'string' && isLineItemCategory(item.category)
    ? item.category
    : null;
  const confidence = typeof item.confidence === 'number' && Number.isFinite(item.confidence)
    ? clamp(item.confidence, 0, 1)
    : null;
  const lineNumber = typeof item.line_number === 'number' && Number.isFinite(item.line_number)
    ? Math.max(1, Math.round(item.line_number))
    : fallbackLineNumber;

  return {
    category,
    cleaned_name: cleanedName,
    confidence,
    line_number: lineNumber,
    line_total: Math.abs(lineTotal),
    line_type: lineType,
    original_text: originalText || cleanedName,
    quantity: toMoney(item.quantity),
    unit_price: toMoney(item.unit_price),
  };
}

function isReceiptSummaryLine(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z]+/g, ' ').trim();

  return (
    normalized === 'subtotal' ||
    normalized === 'total' ||
    normalized === 'tax' ||
    normalized === 'taxes' ||
    normalized === 'taxes and fees' ||
    normalized === 'taxes fees and charges' ||
    normalized === 'fees' ||
    normalized === 'ticket amount' ||
    normalized === 'method of payment' ||
    normalized.startsWith('payment method') ||
    normalized.startsWith('payment methods') ||
    normalized.includes('menard card') ||
    normalized.includes('card')
  );
}

async function replaceDraftLineItems(
  supabase: ReturnType<typeof createClient>,
  {
    ownerId,
    receiptId,
    scanContextJobId,
    status,
    lineItems,
  }: {
    ownerId: string;
    receiptId: string;
    scanContextJobId: string | null;
    status: string;
    lineItems: ReturnType<typeof normalizeLineItems>;
  }
) {
  if (status === 'error') {
    return [];
  }

  const { data: confirmedLines, error: confirmedError } = await supabase
    .from('receipt_line_items')
    .select('id')
    .eq('receipt_id', receiptId)
    .eq('owner_id', ownerId)
    .eq('review_status', 'confirmed')
    .limit(1);

  if (confirmedError) {
    throw new Error(confirmedError.message);
  }

  if ((confirmedLines ?? []).length > 0) {
    const { data, error } = await supabase
      .from('receipt_line_items')
      .select()
      .eq('receipt_id', receiptId)
      .eq('owner_id', ownerId)
      .order('line_number', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }

  const { error: deleteError } = await supabase
    .from('receipt_line_items')
    .delete()
    .eq('receipt_id', receiptId)
    .eq('owner_id', ownerId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (lineItems.length === 0) {
    return [];
  }

  const rows = lineItems.map((lineItem) => ({
    assigned_job_id: scanContextJobId,
    assignment_type: scanContextJobId ? 'job' : 'tools_inventory',
    category: lineItem.category,
    cleaned_name: lineItem.cleaned_name,
    confidence: lineItem.confidence,
    line_number: lineItem.line_number,
    line_total: lineItem.line_total,
    line_type: lineItem.line_type,
    original_text: lineItem.original_text,
    owner_id: ownerId,
    quantity: lineItem.quantity,
    receipt_id: receiptId,
    review_status: 'needs_review',
    unit_price: lineItem.unit_price,
  }));

  const { data, error } = await supabase
    .from('receipt_line_items')
    .insert(rows)
    .select()
    .order('line_number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

function getFirstPublishableKey(publishableKeysJson: string | undefined): string | null {
  if (!publishableKeysJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(publishableKeysJson) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.find((value): value is string => typeof value === 'string') ?? null;
    }

    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed).find((value): value is string => typeof value === 'string') ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

async function markNeedsReview(
  supabase: ReturnType<typeof createClient>,
  receiptId: string,
  errorMessage: string
) {
  const { data, error } = await supabase
    .from('receipts')
    .update({
      error_message: errorMessage,
      review_status: 'needs_review',
      status: 'needs_review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}
