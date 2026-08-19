import { supabase } from '@/src/lib/supabase';
import type { Json, Tables } from '@/src/types/database';

export type ActivityEventStatus = 'completed' | 'needs_attention' | 'review_recommended' | 'resolved';
export type ActivityEventSeverity = 'danger' | 'normal' | 'warning';

export type RecordActivityEventInput = {
  actorUserId?: string | null;
  businessId: string;
  createdByUserId?: string | null;
  detail?: string | null;
  eventType: string;
  jobId?: string | null;
  metadata?: Json;
  ownerId: string;
  severity?: ActivityEventSeverity;
  sourceId?: string | null;
  sourceTable?: string | null;
  status?: ActivityEventStatus;
  title: string;
};

export type RecordReceiptActivityEventInput = {
  detail?: string | null;
  eventType: string;
  metadata?: Json;
  receipt: Tables<'receipts'>;
  severity?: ActivityEventSeverity;
  status?: ActivityEventStatus;
  title: string;
};

export async function recordActivityEvent({
  actorUserId,
  businessId,
  createdByUserId,
  detail,
  eventType,
  jobId,
  metadata = {},
  ownerId,
  severity = 'normal',
  sourceId,
  sourceTable,
  status = 'completed',
  title,
}: RecordActivityEventInput): Promise<void> {
  const { error } = await supabase.from('activity_events').upsert(
    {
      actor_user_id: actorUserId ?? createdByUserId ?? ownerId,
      business_id: businessId,
      created_by_user_id: createdByUserId ?? actorUserId ?? ownerId,
      detail: detail ?? null,
      event_type: eventType,
      job_id: jobId ?? null,
      metadata,
      occurred_at: new Date().toISOString(),
      owner_id: ownerId,
      severity,
      source_id: sourceId ?? null,
      source_table: sourceTable ?? null,
      status,
      title,
    },
    {
      onConflict: 'business_id,event_type,source_table,source_id',
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function recordReceiptActivityEvent({
  detail,
  eventType,
  metadata = {},
  receipt,
  severity = 'normal',
  status = 'completed',
  title,
}: RecordReceiptActivityEventInput): Promise<void> {
  await recordActivityEvent({
    actorUserId: receipt.created_by_user_id ?? receipt.owner_id,
    businessId: receipt.business_id,
    createdByUserId: receipt.created_by_user_id ?? receipt.owner_id,
    detail,
    eventType: 'receipt_activity',
    jobId: receipt.scan_context_job_id,
    metadata: {
      ...(typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) ? metadata : {}),
      receiptActivityType: eventType,
    },
    ownerId: receipt.owner_id,
    severity,
    sourceId: receipt.id,
    sourceTable: 'receipts',
    status,
    title,
  });
}

export async function resolveActivityEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('activity_events')
    .update({
      resolved_at: new Date().toISOString(),
      status: 'resolved',
    })
    .eq('id', eventId);

  if (error) {
    throw new Error(error.message);
  }
}
