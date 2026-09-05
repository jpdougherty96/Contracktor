-- Make queue claims durable, lease-aware, and self-cleaning.

alter table public.receipts
add column if not exists processing_lease_id uuid;

create or replace function public.finalize_receipt_capture(p_receipt_id uuid)
returns public.receipts
language plpgsql
security definer
set search_path = public, pgmq, extensions
as $$
declare
  v_receipt public.receipts;
begin
  select *
  into v_receipt
  from public.receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  if v_receipt.owner_id <> auth.uid() then
    raise exception 'Receipt does not belong to authenticated user.';
  end if;

  if v_receipt.storage_path is null or length(trim(v_receipt.storage_path)) = 0 then
    raise exception 'Receipt image has not been uploaded.';
  end if;

  if v_receipt.processing_status in ('queued', 'processing', 'complete') then
    return v_receipt;
  end if;

  if v_receipt.processing_status = 'failed' then
    update public.receipts
    set
      processing_status = 'queued',
      processing_started_at = null,
      processing_attempts = 0,
      processing_lease_id = null,
      review_status = 'none',
      status = 'processing',
      error_message = null,
      last_processing_error = null,
      updated_at = now()
    where id = p_receipt_id
    returning * into v_receipt;
  elsif v_receipt.processing_status = 'uploading' then
    update public.receipts
    set
      processing_status = 'queued',
      processing_started_at = null,
      processing_attempts = 0,
      processing_lease_id = null,
      review_status = 'none',
      status = 'processing',
      error_message = null,
      updated_at = now()
    where id = p_receipt_id
    returning * into v_receipt;
  else
    return v_receipt;
  end if;

  perform pgmq.delete('receipt_processing', queued.msg_id)
  from pgmq.q_receipt_processing queued
  where queued.message ->> 'receipt_id' = p_receipt_id::text;

  perform pgmq.send(
    'receipt_processing',
    jsonb_build_object('receipt_id', p_receipt_id)
  );

  return v_receipt;
end;
$$;

revoke all on function public.finalize_receipt_capture(uuid) from public;
grant execute on function public.finalize_receipt_capture(uuid) to authenticated;

drop function if exists public.claim_receipt_processing_jobs(integer, integer);

create function public.claim_receipt_processing_jobs(
  p_limit integer default 1,
  p_visibility_timeout integer default 300
)
returns table (
  msg_id bigint,
  receipt_id uuid,
  lease_id uuid
)
language plpgsql
security definer
set search_path = public, pgmq, extensions
as $$
declare
  v_message record;
  v_receipt public.receipts;
  v_receipt_id uuid;
begin
  for v_message in
    select *
    from pgmq.read(
      'receipt_processing',
      greatest(coalesce(p_visibility_timeout, 300), 30),
      least(greatest(coalesce(p_limit, 1), 1), 10)
    )
  loop
    begin
      v_receipt_id := (v_message.message ->> 'receipt_id')::uuid;
    exception
      when invalid_text_representation then
        perform pgmq.delete('receipt_processing', v_message.msg_id);
        continue;
    end;

    if v_receipt_id is null then
      perform pgmq.delete('receipt_processing', v_message.msg_id);
      continue;
    end if;

    select *
    into v_receipt
    from public.receipts
    where id = v_receipt_id
    for update;

    if not found then
      perform pgmq.delete('receipt_processing', v_message.msg_id);
      continue;
    end if;

    if v_receipt.processing_status = 'complete' then
      perform pgmq.delete('receipt_processing', v_message.msg_id);
      continue;
    end if;

    if v_receipt.status in ('accepted', 'voided') then
      perform set_config('app.receipt_financial_commit', 'on', true);

      update public.receipts
      set
        processing_lease_id = null,
        processing_started_at = null,
        processing_status = 'complete',
        updated_at = now()
      where id = v_receipt_id;

      perform pgmq.delete('receipt_processing', v_message.msg_id);
      continue;
    end if;

    if v_receipt.processing_status = 'processing'
      and v_receipt.processing_started_at is not null
      and v_receipt.processing_started_at > now() - interval '15 minutes' then
      continue;
    end if;

    if v_receipt.processing_attempts >= 3 then
      update public.receipts
      set
        error_message = coalesce(
          last_processing_error,
          'Receipt processing stopped after several attempts. Try again or enter the receipt details manually.'
        ),
        processing_lease_id = null,
        processing_started_at = null,
        processing_status = 'failed',
        review_status = 'needs_review',
        status = 'needs_review',
        updated_at = now()
      where id = v_receipt_id;

      perform pgmq.delete('receipt_processing', v_message.msg_id);
      continue;
    end if;

    lease_id := gen_random_uuid();

    update public.receipts
    set
      processing_lease_id = lease_id,
      processing_started_at = now(),
      processing_status = 'processing',
      processing_attempts = processing_attempts + 1,
      last_processing_error = null,
      updated_at = now()
    where id = v_receipt_id;

    msg_id := v_message.msg_id;
    receipt_id := v_receipt_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_receipt_processing_jobs(integer, integer)
from public, anon, authenticated;
grant execute on function public.claim_receipt_processing_jobs(integer, integer)
to service_role;

create or replace function public.recover_stale_receipt_processing()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovered integer;
begin
  perform set_config('app.receipt_financial_commit', 'on', true);

  update public.receipts
  set
    processing_lease_id = null,
    processing_started_at = null,
    processing_status = 'complete',
    updated_at = now()
  where processing_status = 'processing'
    and processing_started_at < now() - interval '15 minutes'
    and status in ('accepted', 'voided');

  update public.receipts
  set
    error_message = 'Receipt processing timed out. Try again or enter the receipt details manually.',
    last_processing_error = 'Receipt processing lease expired.',
    processing_lease_id = null,
    processing_started_at = null,
    processing_status = 'failed',
    review_status = 'needs_review',
    status = 'needs_review',
    updated_at = now()
  where processing_status = 'processing'
    and processing_started_at < now() - interval '15 minutes'
    and status not in ('accepted', 'voided');

  get diagnostics v_recovered = row_count;
  return v_recovered;
end;
$$;

revoke all on function public.recover_stale_receipt_processing()
from public, anon, authenticated;
grant execute on function public.recover_stale_receipt_processing()
to service_role;

do $$
begin
  perform cron.unschedule('contracktor-recover-stale-receipts');
exception
  when others then
    null;
end;
$$;

select cron.schedule(
  'contracktor-recover-stale-receipts',
  '*/5 * * * *',
  $$select public.recover_stale_receipt_processing();$$
);
