-- Close the remaining receipt release gaps after the initial hardening rollout.

create index if not exists receipts_storage_path_idx
on public.receipts (storage_path)
where storage_path is not null;

create or replace function public.guard_receipt_line_reconciliation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_discount_total numeric;
  v_item_total numeric;
  v_line_total numeric;
begin
  if new.status = 'accepted' and new.cost_basis in ('line_items', 'gross_items') then
    select
      coalesce(sum(line_total) filter (where line_type = 'item'), 0),
      coalesce(sum(line_total) filter (where line_type = 'discount'), 0)
    into v_item_total, v_discount_total
    from public.receipt_line_items
    where receipt_id = new.id;

    v_line_total := round(v_item_total - v_discount_total + coalesce(new.tax, 0), 2);

    if new.total is null or abs(v_line_total - new.total) > 0.05 then
      raise exception 'CTX:Receipt lines do not match the amount paid. Review the receipt or save its printed total as one job cost.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_receipt_line_reconciliation on public.receipts;
create trigger guard_receipt_line_reconciliation
before insert or update of status, cost_basis, total, tax
on public.receipts
for each row
execute function public.guard_receipt_line_reconciliation();

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

  -- A stale duplicate message is harmless: claim/persistence leases and terminal-state
  -- checks drain it without duplicate financial writes. Avoid pgmq internal tables here.
  perform pgmq.send(
    'receipt_processing',
    jsonb_build_object('receipt_id', p_receipt_id)
  );

  return v_receipt;
end;
$$;

revoke all on function public.finalize_receipt_capture(uuid) from public;
grant execute on function public.finalize_receipt_capture(uuid) to authenticated;
