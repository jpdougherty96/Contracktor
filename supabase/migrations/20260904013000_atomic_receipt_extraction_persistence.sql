-- Persist one extraction result and its draft lines atomically under the worker lease.

create or replace function public.persist_receipt_extraction(
  p_receipt_id uuid,
  p_processing_lease_id uuid,
  p_extraction jsonb,
  p_status text,
  p_review_status text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.receipts;
  v_lines jsonb;
begin
  select *
  into v_receipt
  from public.receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  if v_receipt.status in ('accepted', 'voided')
    or v_receipt.processing_lease_id is distinct from p_processing_lease_id then
    select coalesce(jsonb_agg(to_jsonb(line_item) order by line_item.line_number), '[]'::jsonb)
    into v_lines
    from public.receipt_line_items line_item
    where line_item.receipt_id = p_receipt_id;

    return jsonb_build_object('receipt', to_jsonb(v_receipt), 'line_items', v_lines);
  end if;

  if p_status not in ('needs_review', 'error') then
    raise exception 'Unsupported extracted receipt status.';
  end if;

  if p_review_status not in ('needs_destination', 'needs_review', 'error') then
    raise exception 'Unsupported extracted receipt review status.';
  end if;

  if not exists (
    select 1
    from public.receipt_line_items line_item
    where line_item.receipt_id = p_receipt_id
      and line_item.review_status = 'confirmed'
  ) then
    delete from public.receipt_line_items
    where receipt_id = p_receipt_id;

    insert into public.receipt_line_items (
      receipt_id,
      owner_id,
      business_id,
      assigned_job_id,
      line_number,
      original_text,
      cleaned_name,
      quantity,
      unit_price,
      line_total,
      line_type,
      category,
      assignment_type,
      review_status,
      confidence,
      updated_at
    )
    select
      v_receipt.id,
      v_receipt.owner_id,
      v_receipt.business_id,
      v_receipt.scan_context_job_id,
      line.line_number,
      line.original_text,
      line.cleaned_name,
      line.quantity,
      line.unit_price,
      line.line_total,
      line.line_type,
      line.category,
      case when v_receipt.scan_context_job_id is null then 'tools_inventory' else 'job' end,
      'needs_review',
      line.confidence,
      now()
    from jsonb_to_recordset(coalesce(p_extraction->'line_items', '[]'::jsonb)) as line(
      category text,
      cleaned_name text,
      confidence numeric,
      line_number integer,
      line_total numeric,
      line_type text,
      original_text text,
      quantity numeric,
      unit_price numeric
    )
    where p_status <> 'error';
  end if;

  update public.receipts
  set
    ai_confidence = nullif(p_extraction->>'confidence', '')::numeric,
    category = p_extraction->>'category',
    error_message = p_error_message,
    extracted_json = p_extraction,
    last_processing_error = null,
    processing_lease_id = null,
    processing_started_at = null,
    processing_status = 'complete',
    receipt_date = nullif(p_extraction->>'receipt_date', '')::date,
    review_status = p_review_status,
    status = p_status,
    subtotal = nullif(p_extraction->>'subtotal', '')::numeric,
    tax = nullif(p_extraction->>'tax', '')::numeric,
    total = nullif(p_extraction->>'total', '')::numeric,
    updated_at = now(),
    vendor = nullif(trim(p_extraction->>'vendor'), '')
  where id = p_receipt_id
  returning * into v_receipt;

  select coalesce(jsonb_agg(to_jsonb(line_item) order by line_item.line_number), '[]'::jsonb)
  into v_lines
  from public.receipt_line_items line_item
  where line_item.receipt_id = p_receipt_id;

  return jsonb_build_object('receipt', to_jsonb(v_receipt), 'line_items', v_lines);
end;
$$;

revoke all on function public.persist_receipt_extraction(uuid, uuid, jsonb, text, text, text)
from public, anon, authenticated;
grant execute on function public.persist_receipt_extraction(uuid, uuid, jsonb, text, text, text)
to service_role;
