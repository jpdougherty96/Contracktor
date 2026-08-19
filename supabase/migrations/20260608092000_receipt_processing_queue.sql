create extension if not exists pgmq;

alter table public.receipts
add column if not exists processing_status text,
add column if not exists processing_started_at timestamptz,
add column if not exists processing_attempts integer not null default 0,
add column if not exists last_processing_error text;

alter table public.receipts
drop constraint if exists receipts_processing_status_check;

alter table public.receipts
add constraint receipts_processing_status_check
check (processing_status in ('uploading', 'queued', 'processing', 'complete', 'failed'));

alter table public.receipts
drop constraint if exists receipts_review_status_check;

alter table public.receipts
add constraint receipts_review_status_check
check (review_status in ('none', 'processing', 'needs_destination', 'needs_review', 'reviewed', 'error'));

update public.receipts
set processing_status = case
  when status = 'accepted' then 'complete'
  when status = 'needs_review' then 'complete'
  when status = 'error' then 'failed'
  when status = 'processing' then 'processing'
  else 'complete'
end
where processing_status is null;

alter table public.receipts
alter column processing_status set default 'uploading',
alter column processing_status set not null;

create index if not exists receipts_owner_processing_idx
on public.receipts (owner_id, processing_status, created_at desc);

create index if not exists receipts_processing_queue_idx
on public.receipts (processing_status, created_at)
where processing_status in ('queued', 'processing');

do $$
begin
  if not exists (
    select 1
    from pgmq.meta
    where queue_name = 'receipt_processing'
  ) then
    perform pgmq.create('receipt_processing');
  end if;
end;
$$;

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
      review_status = 'none',
      status = 'processing',
      error_message = null,
      updated_at = now()
    where id = p_receipt_id
    returning * into v_receipt;
  else
    return v_receipt;
  end if;

  perform pgmq.send(
    'receipt_processing',
    jsonb_build_object('receipt_id', p_receipt_id)
  );

  return v_receipt;
end;
$$;

revoke all on function public.finalize_receipt_capture(uuid) from public;
grant execute on function public.finalize_receipt_capture(uuid) to authenticated;

create or replace function public.claim_receipt_processing_jobs(
  p_limit integer default 1,
  p_visibility_timeout integer default 300
)
returns table (
  msg_id bigint,
  receipt_id uuid
)
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select
    queued.msg_id,
    (queued.message ->> 'receipt_id')::uuid as receipt_id
  from pgmq.read(
    'receipt_processing',
    greatest(coalesce(p_visibility_timeout, 300), 30),
    least(greatest(coalesce(p_limit, 1), 1), 10)
  ) as queued
  where queued.message ? 'receipt_id';
$$;

create or replace function public.delete_receipt_processing_job(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select pgmq.delete('receipt_processing', p_msg_id);
$$;

revoke all on function public.claim_receipt_processing_jobs(integer, integer) from public;
revoke all on function public.delete_receipt_processing_job(bigint) from public;
grant execute on function public.claim_receipt_processing_jobs(integer, integer) to service_role;
grant execute on function public.delete_receipt_processing_job(bigint) to service_role;

create or replace function public.mark_receipt_processing(p_receipt_id uuid)
returns public.receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.receipts;
begin
  update public.receipts
  set
    processing_status = 'processing',
    processing_started_at = now(),
    processing_attempts = processing_attempts + 1,
    last_processing_error = null,
    updated_at = now()
  where id = p_receipt_id
  returning * into v_receipt;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  return v_receipt;
end;
$$;

revoke all on function public.mark_receipt_processing(uuid) from public;
grant execute on function public.mark_receipt_processing(uuid) to service_role;
