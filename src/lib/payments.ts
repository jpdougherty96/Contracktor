import { recordActivityEvent } from '@/src/lib/activityEvents';
import { formatCurrency } from '@/src/lib/financials';
import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type CreatePaymentInput = {
  amount: number;
  method?: string | null;
  paymentDate: string;
  note?: string;
};

export type UpdatePaymentInput = CreatePaymentInput;
export type CustomerPayment = Tables<'customer_payments'>;

const paymentFields =
  'id, job_id, owner_id, business_id, created_by_user_id, amount, payment_date, method, source, note, created_at, updated_at';

export async function createPayment(
  jobId: string,
  input: CreatePaymentInput
): Promise<CustomerPayment> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to add a payment.');
  }

  const { data, error } = await supabase
    .from('customer_payments')
    .insert({
      amount: input.amount,
      job_id: jobId,
      method: input.method?.trim() || null,
      note: input.note?.trim() || null,
      owner_id: userData.user.id,
      payment_date: input.paymentDate,
      source: 'manual',
    })
    .select(paymentFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEventSafely({
    businessId: data.business_id,
    createdByUserId: data.created_by_user_id ?? data.owner_id,
    detail: `${formatCurrency(data.amount, { showCents: true })}${
      data.note ? ` - ${data.note}` : ''
    }`,
    eventType: 'payment_recorded',
    jobId: data.job_id,
    metadata: {
      amount: data.amount,
      method: data.method,
      paymentDate: data.payment_date,
      source: data.source,
    },
    ownerId: data.owner_id,
    sourceId: data.id,
    sourceTable: 'customer_payments',
    title: 'Payment recorded',
  });

  return data;
}

export async function fetchPayment(paymentId: string): Promise<CustomerPayment> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to view a payment.');
  }

  const { data, error } = await supabase
    .from('customer_payments')
    .select(paymentFields)
    .eq('id', paymentId)
    .eq('owner_id', userData.user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function recordActivityEventSafely(
  input: Parameters<typeof recordActivityEvent>[0]
): Promise<void> {
  try {
    await recordActivityEvent(input);
  } catch {
    // Activity is an audit aid; the payment is the source of truth.
  }
}

export async function updatePayment(
  paymentId: string,
  input: UpdatePaymentInput
): Promise<CustomerPayment> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update a payment.');
  }

  const { data, error } = await supabase
    .from('customer_payments')
    .update({
      amount: input.amount,
      method: input.method?.trim() || null,
      note: input.note?.trim() || null,
      payment_date: input.paymentDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('owner_id', userData.user.id)
    .select(paymentFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
