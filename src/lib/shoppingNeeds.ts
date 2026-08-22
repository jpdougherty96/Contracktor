import { recordActivityEvent } from '@/src/lib/activityEvents';
import { fetchJobs } from '@/src/lib/jobs';
import { supabase } from '@/src/lib/supabase';
import type { Json, Tables } from '@/src/types/database';
import type { Job } from '@/src/types/job';

export type ShoppingNeed = Tables<'shopping_needs'>;
export type ShoppingNeedStatus = 'dismissed' | 'fulfilled' | 'open';

export type ShoppingNeedWithJob = ShoppingNeed & {
  job: Job | null;
  jobName: string;
};

export type ShoppingNeedLineAssignmentSuggestion = {
  assignedJobId: string;
  lineItemId: string;
  shoppingNeedDescription: string;
  shoppingNeedId: string;
};

export type CreateShoppingNeedInput = {
  assignedToUserId?: string | null;
  description: string;
  jobId?: string | null;
  neededBy?: string | null;
  normalizedName?: string | null;
  notes?: string | null;
  quantity?: number | null;
  sourceId?: string | null;
  sourceType?: string | null;
  unit?: string | null;
};

const shoppingNeedFields =
  'id, business_id, owner_id, job_id, initiated_by_user_id, performed_by_type, performed_by_user_id, assigned_to_user_id, source_type, source_id, description, normalized_name, quantity, unit, needed_by, status, notes, completed_at, dismissed_at, created_at, updated_at, user_display_text, user_edited_at, user_edited_by_user_id';

export async function fetchOpenShoppingNeeds(): Promise<ShoppingNeedWithJob[]> {
  return fetchShoppingNeeds({ statuses: ['open'] });
}

export async function fetchJobShoppingNeeds(jobId: string): Promise<ShoppingNeedWithJob[]> {
  return fetchShoppingNeeds({ jobId, statuses: ['open', 'fulfilled'] });
}

export async function createShoppingNeed(input: CreateShoppingNeedInput): Promise<ShoppingNeed> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to add a shopping need.');
  }

  const normalizedInput = normalizeShoppingNeedInput(input);
  const description = normalizedInput.description;
  const isUserAuthored = !input.sourceType || input.sourceType === 'manual';
  const userDisplayText = isUserAuthored ? input.description.trim() : null;

  if (!description) {
    throw new Error('Shopping need description is required.');
  }

  const shouldTryMerge = input.sourceType !== 'tell_contracktor';
  const existingNeed = shouldTryMerge && input.jobId
    ? await findMergeableShoppingNeed({
        description,
        jobId: input.jobId,
        normalizedName: normalizedInput.normalizedName,
        unit: normalizedInput.unit,
      })
    : null;

  if (existingNeed && normalizedInput.quantity) {
    const nextQuantity = (existingNeed.quantity ?? 0) + normalizedInput.quantity;
    const { data: updatedNeed, error: updateError } = await supabase
      .from('shopping_needs')
      .update({
        description: chooseBetterDescription(existingNeed.description, description),
        normalized_name: existingNeed.normalized_name ?? normalizedInput.normalizedName,
        quantity: nextQuantity,
        unit: existingNeed.unit ?? normalizedInput.unit,
        user_display_text: userDisplayText ?? existingNeed.user_display_text,
        user_edited_at: userDisplayText ? new Date().toISOString() : existingNeed.user_edited_at,
        user_edited_by_user_id: userDisplayText ? userData.user.id : existingNeed.user_edited_by_user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingNeed.id)
      .select(shoppingNeedFields)
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    await recordShoppingNeedEventSafely(updatedNeed, {
      detail: formatShoppingNeedDetail(updatedNeed),
      eventType: 'shopping_need_updated',
      metadata: {
        addedQuantity: normalizedInput.quantity,
        previousQuantity: existingNeed.quantity,
        quantity: updatedNeed.quantity,
        sourceType: input.sourceType ?? 'manual',
        unit: updatedNeed.unit,
      },
      title: 'Shopping need updated',
    });

    return updatedNeed;
  }

  const { data, error } = await supabase
    .from('shopping_needs')
    .insert({
      assigned_to_user_id: input.assignedToUserId ?? null,
      description,
      job_id: input.jobId ?? null,
      needed_by: input.neededBy ?? null,
      normalized_name: normalizedInput.normalizedName,
      notes: input.notes?.trim() || null,
      owner_id: userData.user.id,
      quantity: normalizedInput.quantity,
      source_id: input.sourceId ?? null,
      source_type: input.sourceType ?? 'manual',
      unit: normalizedInput.unit,
      user_display_text: userDisplayText,
      user_edited_at: userDisplayText ? new Date().toISOString() : null,
      user_edited_by_user_id: userDisplayText ? userData.user.id : null,
    })
    .select(shoppingNeedFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordShoppingNeedEventSafely(data, {
    detail: formatShoppingNeedDetail(data),
    eventType: 'shopping_need_created',
    metadata: {
      neededBy: data.needed_by,
      quantity: data.quantity,
      sourceType: data.source_type,
      unit: data.unit,
    },
    title: 'Shopping need added',
  });

  return data;
}

async function findMergeableShoppingNeed({
  description,
  jobId,
  normalizedName,
  unit,
}: {
  description: string;
  jobId: string;
  normalizedName: string | null;
  unit: string | null;
}): Promise<ShoppingNeed | null> {
  const { data, error } = await supabase
    .from('shopping_needs')
    .select(shoppingNeedFields)
    .eq('job_id', jobId)
    .eq('status', 'open');

  if (error) {
    throw new Error(error.message);
  }

  const incomingKey = getShoppingNeedKey(description, normalizedName);
  const incomingUnit = normalizeShoppingUnit(unit);

  return (
    (data ?? []).find((need) => {
      const existingKey = getShoppingNeedKey(need.description, need.normalized_name);
      const existingUnit = normalizeShoppingUnit(need.unit);

      if (incomingUnit && existingUnit && incomingUnit !== existingUnit) {
        return false;
      }

      return keysAreMergeable(existingKey, incomingKey);
    }) ?? null
  );
}

function normalizeShoppingNeedInput(input: CreateShoppingNeedInput): {
  description: string;
  normalizedName: string | null;
  quantity: number | null;
  unit: string | null;
} {
  const parsed = parseCountUnit(input.description);
  const description = normalizeDescription(parsed.description);
  const unit = normalizeShoppingUnit(input.unit ?? parsed.unit);

  return {
    description,
    normalizedName: input.normalizedName?.trim() || getShoppingNeedKey(description, null) || null,
    quantity: input.quantity ?? parsed.quantity,
    unit,
  };
}

// Keep this normalization family in lockstep with tell-contracktor/index.ts.
// The client and Deno edge runtime cannot share this module directly, so a boundary test compares them.
function parseCountUnit(value: string): { description: string; quantity: number | null; unit: string | null } {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const unitFirstMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s+(boxes?|buckets?|sheets?|bags?|bundles?|tubes?|rolls?|pieces?|feet|foot|ft|linear feet|yards?|yds?|gallons?|gals?)\s+(?:of\s+)?(.+)$/i
  );

  if (unitFirstMatch) {
    return {
      description: unitFirstMatch[3].trim(),
      quantity: Number(unitFirstMatch[1]),
      unit: pluralizeUnit(unitFirstMatch[2]),
    };
  }

  const countMatch = trimmed.match(/^([1-9]\d*)\s+(.+)$/);

  if (countMatch) {
    return {
      description: countMatch[2].trim(),
      quantity: Number(countMatch[1]),
      unit: null,
    };
  }

  return { description: trimmed, quantity: null, unit: null };
}

export async function markShoppingNeedFulfilled(needId: string): Promise<ShoppingNeed> {
  return updateShoppingNeedStatus(needId, 'fulfilled');
}

export async function fulfillShoppingNeedsFromReceipt(
  receipt: Tables<'receipts'>,
  lineItems?: Tables<'receipt_line_items'>[]
): Promise<ShoppingNeed[]> {
  if (receipt.status !== 'accepted' || receipt.review_status !== 'reviewed') {
    return [];
  }

  const receiptLineItems = lineItems ?? (await fetchReceiptShoppingLineItems(receipt.id));
  const candidateLines = getReceiptShoppingNeedCandidateLines(receipt, receiptLineItems);

  if (candidateLines.length === 0) {
    return [];
  }

  const jobIds = Array.from(
    new Set(candidateLines.map((lineItem) => lineItem.assigned_job_id).filter(isPresent))
  );

  if (jobIds.length === 0) {
    return [];
  }

  const { data: needs, error } = await supabase
    .from('shopping_needs')
    .select(shoppingNeedFields)
    .eq('status', 'open')
    .in('job_id', jobIds);

  if (error) {
    throw new Error(error.message);
  }

  const matches = findReceiptShoppingNeedMatches(needs ?? [], candidateLines);
  const fulfilledNeeds: ShoppingNeed[] = [];

  for (const match of matches) {
    const { data: existingFulfillment, error: existingFulfillmentError } = await supabase
      .from('shopping_need_fulfillments')
      .select('id')
      .eq('shopping_need_id', match.need.id)
      .eq('source_id', receipt.id)
      .maybeSingle();

    if (existingFulfillmentError) {
      throw new Error(existingFulfillmentError.message);
    }

    if (!existingFulfillment) {
      const { error: fulfillmentError } = await supabase.from('shopping_need_fulfillments').insert({
        business_id: match.need.business_id,
        performed_by_type: 'system',
        quantity: match.need.quantity ?? match.lineItem.quantity,
        receipt_line_item_id: match.lineItem.id,
        shopping_need_id: match.need.id,
        source_id: receipt.id,
        source_type: 'receipt',
      });

      if (fulfillmentError) {
        throw new Error(fulfillmentError.message);
      }
    }

    const { data: updatedNeed, error: updateError } = await supabase
      .from('shopping_needs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'fulfilled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.need.id)
      .eq('status', 'open')
      .select(shoppingNeedFields)
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    await recordShoppingNeedEventSafely(updatedNeed, {
      detail: `${formatShoppingNeedDetail(updatedNeed)} matched on ${
        receipt.vendor?.trim() || 'receipt'
      } receipt.`,
      eventType: 'shopping_need_fulfilled_from_receipt',
      metadata: {
        receiptId: receipt.id,
        receiptLineItemId: match.lineItem.id,
        vendor: receipt.vendor,
      },
      title: 'Shopping need fulfilled',
    });

    fulfilledNeeds.push(updatedNeed);
  }

  return fulfilledNeeds;
}

export async function undoShoppingNeedFulfillmentsFromReceipt(receiptId: string): Promise<void> {
  const { data: fulfillments, error: fulfillmentError } = await supabase
    .from('shopping_need_fulfillments')
    .select('id, shopping_need_id')
    .eq('source_type', 'receipt')
    .eq('source_id', receiptId);

  if (fulfillmentError) {
    throw new Error(fulfillmentError.message);
  }

  const needIds = Array.from(new Set((fulfillments ?? []).map((fulfillment) => fulfillment.shopping_need_id)));

  if ((fulfillments ?? []).length > 0) {
    const { error: deleteError } = await supabase
      .from('shopping_need_fulfillments')
      .delete()
      .eq('source_type', 'receipt')
      .eq('source_id', receiptId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  for (const needId of needIds) {
    const { data: remainingFulfillments, error: remainingError } = await supabase
      .from('shopping_need_fulfillments')
      .select('id')
      .eq('shopping_need_id', needId)
      .limit(1);

    if (remainingError) {
      throw new Error(remainingError.message);
    }

    if ((remainingFulfillments ?? []).length > 0) {
      continue;
    }

    const { error: reopenError } = await supabase
      .from('shopping_needs')
      .update({
        completed_at: null,
        status: 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('id', needId)
      .eq('status', 'fulfilled');

    if (reopenError) {
      throw new Error(reopenError.message);
    }
  }
}

export async function suggestReceiptLineAssignmentsFromShoppingNeeds(
  lineItems: Tables<'receipt_line_items'>[],
  jobIds: string[]
): Promise<ShoppingNeedLineAssignmentSuggestion[]> {
  const candidateJobIds = Array.from(new Set(jobIds.filter(Boolean)));

  if (candidateJobIds.length === 0 || lineItems.length === 0) {
    return [];
  }

  const { data: needs, error } = await supabase
    .from('shopping_needs')
    .select(shoppingNeedFields)
    .eq('status', 'open')
    .in('job_id', candidateJobIds);

  if (error) {
    throw new Error(error.message);
  }

  const candidateLines = lineItems
    .filter((lineItem) => lineItem.line_type === 'item')
    .filter((lineItem) => lineItem.assignment_type !== 'ignore')
    .flatMap((lineItem) =>
      candidateJobIds.map((jobId) => ({
        ...lineItem,
        assigned_job_id: jobId,
        assignment_type: 'job',
        review_status: 'confirmed',
      }))
    );
  const matches = findReceiptShoppingNeedMatches(needs ?? [], candidateLines);

  return matches.map((match) => ({
    assignedJobId: match.need.job_id ?? match.lineItem.assigned_job_id ?? '',
    lineItemId: match.lineItem.id,
    shoppingNeedDescription: formatShoppingNeedDetail(match.need),
    shoppingNeedId: match.need.id,
  })).filter((suggestion) => Boolean(suggestion.assignedJobId));
}

async function fetchReceiptShoppingLineItems(
  receiptId: string
): Promise<Tables<'receipt_line_items'>[]> {
  const { data, error } = await supabase
    .from('receipt_line_items')
    .select('*')
    .eq('receipt_id', receiptId)
    .order('line_number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

function getReceiptShoppingNeedCandidateLines(
  receipt: Tables<'receipts'>,
  lineItems: Tables<'receipt_line_items'>[]
): Tables<'receipt_line_items'>[] {
  return lineItems
    .filter((lineItem) => lineItem.line_type === 'item')
    .filter((lineItem) => lineItem.assignment_type !== 'ignore')
    .filter((lineItem) => lineItem.review_status !== 'ignored')
    .map((lineItem) => {
      if (
        lineItem.review_status === 'confirmed' &&
        lineItem.assignment_type === 'job' &&
        lineItem.assigned_job_id
      ) {
        return lineItem;
      }

      if (!receipt.scan_context_job_id) {
        return null;
      }

      return {
        ...lineItem,
        assigned_job_id: receipt.scan_context_job_id,
        assignment_type: 'job',
        review_status: 'confirmed',
      };
    })
    .filter(isPresent);
}

export async function updateShoppingNeedDetails(
  needId: string,
  input: Pick<CreateShoppingNeedInput, 'description' | 'normalizedName' | 'quantity' | 'unit'>
): Promise<ShoppingNeed> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update a shopping need.');
  }

  const normalizedInput = normalizeShoppingNeedInput({
    description: input.description,
    normalizedName: input.normalizedName,
    quantity: input.quantity,
    unit: input.unit,
  });

  if (!normalizedInput.description) {
    throw new Error('Shopping need description is required.');
  }

  const { data, error } = await supabase
    .from('shopping_needs')
    .update({
      description: normalizedInput.description,
      normalized_name: normalizedInput.normalizedName,
      quantity: normalizedInput.quantity,
      unit: normalizedInput.unit,
      updated_at: new Date().toISOString(),
      user_display_text: input.description.trim(),
      user_edited_at: new Date().toISOString(),
      user_edited_by_user_id: userData.user.id,
    })
    .eq('id', needId)
    .select(shoppingNeedFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordShoppingNeedEventSafely(data, {
    detail: formatShoppingNeedDetail(data),
    eventType: 'shopping_need_edited',
    metadata: {
      quantity: data.quantity,
      unit: data.unit,
    },
    title: 'Shopping need edited',
  });

  return data;
}

export async function dismissShoppingNeed(needId: string): Promise<ShoppingNeed> {
  return updateShoppingNeedStatus(needId, 'dismissed');
}

export async function reopenShoppingNeed(needId: string): Promise<ShoppingNeed> {
  return updateShoppingNeedStatus(needId, 'open');
}

async function fetchShoppingNeeds({
  jobId,
  statuses,
}: {
  jobId?: string;
  statuses?: ShoppingNeedStatus[];
}): Promise<ShoppingNeedWithJob[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return [];
  }

  let query = supabase
    .from('shopping_needs')
    .select(shoppingNeedFields)
    .order('created_at', { ascending: false });

  if (jobId) {
    query = query.eq('job_id', jobId);
  }

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses);
  }

  const [{ data, error }, jobs] = await Promise.all([query, fetchJobs()]);

  if (error) {
    throw new Error(error.message);
  }

  return attachJobs(data ?? [], jobs);
}

async function updateShoppingNeedStatus(
  needId: string,
  status: ShoppingNeedStatus
): Promise<ShoppingNeed> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update a shopping need.');
  }

  const { data, error } = await supabase
    .from('shopping_needs')
    .update({
      completed_at: status === 'fulfilled' ? new Date().toISOString() : null,
      dismissed_at: status === 'dismissed' ? new Date().toISOString() : null,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', needId)
    .select(shoppingNeedFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordShoppingNeedEventSafely(data, {
    detail: formatShoppingNeedDetail(data),
    eventType:
      status === 'fulfilled'
        ? 'shopping_need_fulfilled'
        : status === 'dismissed'
          ? 'shopping_need_dismissed'
          : 'shopping_need_reopened',
    metadata: {
      status,
    },
    title:
      status === 'fulfilled'
        ? 'Shopping need checked off'
        : status === 'dismissed'
          ? 'Shopping need dismissed'
          : 'Shopping need reopened',
  });

  return data;
}

function attachJobs(needs: ShoppingNeed[], jobs: Job[]): ShoppingNeedWithJob[] {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  return needs.map((need) => {
    const job = need.job_id ? jobsById.get(need.job_id) ?? null : null;

    return {
      ...need,
      job,
      jobName: job?.name ?? 'General shopping',
    };
  });
}

function findReceiptShoppingNeedMatches(
  needs: ShoppingNeed[],
  lineItems: Tables<'receipt_line_items'>[]
): { lineItem: Tables<'receipt_line_items'>; need: ShoppingNeed }[] {
  const candidates = needs.flatMap((need) =>
    lineItems
      .filter((lineItem) => lineItem.assigned_job_id === need.job_id)
      .map((lineItem) => ({
        lineItem,
        need,
        score: scoreShoppingNeedLineMatch(need, lineItem),
      }))
      .filter((candidate) => candidate.score >= 1)
  );

  const candidatesByNeedId = groupBy(candidates, (candidate) => candidate.need.id);
  const candidatesByLineItemId = groupBy(candidates, (candidate) => candidate.lineItem.id);

  return Array.from(candidatesByNeedId.values())
    .map((needCandidates) => {
      const bestCandidate = [...needCandidates].sort((left, right) => right.score - left.score)[0];

      if (!bestCandidate) {
        return null;
      }

      const matchingLineCandidates = candidatesByLineItemId.get(bestCandidate.lineItem.id) ?? [];
      const bestLineScore = Math.max(...matchingLineCandidates.map((candidate) => candidate.score));
      const tiedLineMatches = matchingLineCandidates.filter(
        (candidate) => candidate.score === bestLineScore
      );

      if (bestCandidate.score !== bestLineScore || tiedLineMatches.length > 1) {
        return null;
      }

      return {
        lineItem: bestCandidate.lineItem,
        need: bestCandidate.need,
      };
    })
    .filter(isPresent);
}

function scoreShoppingNeedLineMatch(
  need: ShoppingNeed,
  lineItem: Tables<'receipt_line_items'>
): number {
  const needTokens = getMatchTokens(need.normalized_name || need.description);
  const lineTokens = getMatchTokens(
    [lineItem.cleaned_name, lineItem.original_text].filter(Boolean).join(' ')
  );

  if (needTokens.length === 0 || lineTokens.length === 0) {
    return 0;
  }

  const lineTokenSet = new Set(lineTokens);
  const matchedTokens = needTokens.filter((token) => lineTokenSet.has(token));

  if (hasMaterialConflict(needTokens, lineTokens)) {
    return 0;
  }

  if (need.quantity && !receiptQuantitySatisfiesNeed(need.quantity, lineItem.quantity)) {
    return 0;
  }

  if (hasInsulationSpecMatch(needTokens, lineTokens)) {
    return needTokens.length + 3;
  }

  if (!hasStrongMaterialTokenOverlap(needTokens, matchedTokens)) {
    return 0;
  }

  const exactPhraseBonus = normalizeMatchText(lineItem.cleaned_name).includes(
    normalizeMatchText(need.description)
  )
    ? 2
    : 0;

  return needTokens.length + exactPhraseBonus;
}

function receiptQuantitySatisfiesNeed(
  needQuantity: number,
  receiptQuantity: number | null
): boolean {
  if (!receiptQuantity) {
    return false;
  }

  return Math.abs(receiptQuantity - needQuantity) <= 0.0001;
}

function hasInsulationSpecMatch(needTokens: string[], lineTokens: string[]): boolean {
  const needTokenSet = new Set(needTokens);
  const lineTokenSet = new Set(lineTokens);
  const needMentionsInsulation =
    needTokenSet.has('insulation') || needTokenSet.has('batt') || needTokenSet.has('kraft');

  if (!needMentionsInsulation) {
    return false;
  }

  const matchingRValue = needTokens.some((token) => /^r\d+$/.test(token) && lineTokenSet.has(token));
  const matchingFacing =
    !needTokenSet.has('kraft') || lineTokenSet.has('kraft') || lineTokenSet.has('faced');

  return matchingRValue && matchingFacing;
}

function hasMaterialConflict(needTokens: string[], lineTokens: string[]): boolean {
  const needTokenSet = new Set(needTokens);
  const lineTokenSet = new Set(lineTokens);

  if (needTokenSet.has('treated') && lineTokenSet.has('spf') && !lineTokenSet.has('treated')) {
    return true;
  }

  if (needTokenSet.has('spf') && lineTokenSet.has('treated') && !lineTokenSet.has('spf')) {
    return true;
  }

  if (needTokenSet.has('plywood') && lineTokenSet.has('osb')) {
    return true;
  }

  if (needTokenSet.has('osb') && lineTokenSet.has('plywood')) {
    return true;
  }

  return false;
}

function hasStrongMaterialTokenOverlap(needTokens: string[], matchedTokens: string[]): boolean {
  if (matchedTokens.length === needTokens.length) {
    return true;
  }

  if (matchedTokens.length < 2) {
    return false;
  }

  const matchRatio = matchedTokens.length / needTokens.length;
  const hasSpecificToken = matchedTokens.some((token) => isSpecificMaterialToken(token));

  return hasSpecificToken && matchRatio >= 0.6;
}

function isSpecificMaterialToken(token: string): boolean {
  return /\d/.test(token) || token.length >= 5;
}

function getMatchTokens(value: string): string[] {
  const tokens = normalizeMatchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .map(normalizeMatchToken)
    .filter((token) => !shoppingNeedMatchStopWords.has(token));

  return Array.from(new Set(tokens));
}

function normalizeMatchToken(token: string): string {
  const aliases: Record<string, string> = {
    batt: 'batt',
    batting: 'batt',
    batts: 'batt',
    insul: 'insulation',
    insulatn: 'insulation',
    kft: 'kraft',
    plywd: 'plywood',
    pt: 'treated',
  };

  if (aliases[token]) {
    return aliases[token];
  }

  if (token.length > 4 && token.endsWith('s')) {
    return token.slice(0, -1);
  }

  return token;
}

function normalizeMatchText(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\br\s*-?\s*(\d+)\b/g, 'r$1')
    .replace(/\b2\s*(?:x|×|by)\s*4\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\b/g, '2x4 $1foot')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*2\s*(?:x|×|by)\s*4\b/g, '2x4 $1foot')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\b/g, '$1foot')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)\b/g, '$1inch')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\b/g, '$1x$2')
    .replace(/\b(2)\s*(?:x|×|by)\s*(4)s?\b/g, '$1x$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

const shoppingNeedMatchStopWords = new Set([
  'a',
  'additional',
  'an',
  'and',
  'bag',
  'bags',
  'box',
  'boxes',
  'bucket',
  'buckets',
  'bundle',
  'bundles',
  'buy',
  'extra',
  'for',
  'need',
  'needs',
  'of',
  'piece',
  'pieces',
  'roll',
  'rolls',
  'sheet',
  'sheets',
  'the',
  'tube',
  'tubes',
]);

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const group = grouped.get(key);

    if (group) {
      group.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return grouped;
}

function chooseBetterDescription(existingDescription: string, incomingDescription: string): string {
  const existing = normalizeDescription(existingDescription);
  const incoming = normalizeDescription(incomingDescription);

  if (incoming.length > existing.length && !incoming.includes(existing)) {
    return capitalizeFirst(incoming);
  }

  return capitalizeFirst(existing);
}

function formatShoppingNeedDetail(need: ShoppingNeed): string {
  const quantity = need.quantity
    ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(need.quantity)}${
        need.unit ? ` ${need.unit}` : ' x'
      } `
    : '';

  return `${quantity}${capitalizeFirst(formatShoppingNeedDescription(need))}`;
}

function formatShoppingNeedDescription(need: ShoppingNeed): string {
  let description = need.description.trim();

  if (need.quantity) {
    const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
      need.quantity
    );
    description = description
      .replace(new RegExp(`^${escapeRegExp(quantity)}\\s*`, 'i'), '')
      .replace(/^(more|additional|extra|x|×|of)\s+/i, '')
      .trim();
  }

  return capitalizeFirst(description || need.description);
}

function getShoppingNeedKey(description: string, normalizedName: string | null): string {
  const descriptionKey = normalizeKey(description);

  if (descriptionKey) {
    return descriptionKey;
  }

  return normalizeKey(normalizedName || '');
}

function keysAreMergeable(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  return left.includes(right) || right.includes(left);
}

function normalizeDescription(value: string): string {
  return capitalizeFirst(
    value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^(more|additional|extra|need|needs|buy|of)\s+/i, '')
      .trim()
  );
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*(?:×|x)\s*/g, 'x')
    .replace(/"/g, ' inch ')
    .replace(/'/g, ' foot ')
    .replace(/\b(inches|inch|in)\b/g, 'inch')
    .replace(/\b(feet|foot|ft|linear feet|linear foot)\b/g, 'foot')
    .replace(/\b(more|additional|extra|need|needs|buy|of|the|a|an)\b/g, ' ')
    .replace(/\b(box|boxes|bucket|buckets|sheet|sheets|bag|bags|bundle|bundles|tube|tubes|roll|rolls|piece|pieces)\b/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeShoppingUnit(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  return pluralizeUnit(value.trim()) || null;
}

function pluralizeUnit(value: string): string {
  const unit = normalizeUnitKey(value);
  const unitMap: Record<string, string> = {
    bag: 'bags',
    box: 'boxes',
    bucket: 'buckets',
    bundle: 'bundles',
    piece: 'pieces',
    foot: 'feet',
    ft: 'feet',
    'linear foot': 'feet',
    'linear feet': 'feet',
    yard: 'yards',
    yd: 'yards',
    gallon: 'gallons',
    gal: 'gallons',
    roll: 'rolls',
    sheet: 'sheets',
    tube: 'tubes',
  };

  return unitMap[unit] ?? '';
}

function normalizeUnitKey(value: string): string {
  const unit = value.toLowerCase().trim();

  if (unit === 'boxes') {
    return 'box';
  }

  if (unit.endsWith('s')) {
    return unit.slice(0, -1);
  }

  return unit;
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

async function recordShoppingNeedEventSafely(
  need: ShoppingNeed,
  {
    detail,
    eventType,
    metadata,
    title,
  }: {
    detail: string;
    eventType: string;
    metadata: Json;
    title: string;
  }
): Promise<void> {
  try {
    await recordActivityEvent({
      actorUserId: need.performed_by_user_id ?? need.initiated_by_user_id ?? need.owner_id,
      businessId: need.business_id,
      createdByUserId: need.initiated_by_user_id ?? need.owner_id,
      detail,
      eventType,
      jobId: need.job_id,
      metadata,
      ownerId: need.owner_id,
      sourceId: need.id,
      sourceTable: 'shopping_needs',
      title,
    });
  } catch {
    // Activity is an audit aid; the shopping need is the source of truth.
  }
}
