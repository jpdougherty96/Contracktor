-- Persist every capture-time receipt destination and repair non-costing future rebates.

alter table public.receipts
add column if not exists scan_context_job_ids uuid[] not null default '{}'::uuid[],
add column if not exists scan_context_includes_inventory boolean not null default false;

-- The metadata backfill includes accepted receipts. Authorize this migration transaction through
-- the same narrow guard used by the atomic receipt capability.
select set_config('app.receipt_financial_commit', 'on', true);

update public.receipts
set scan_context_job_ids = array[scan_context_job_id]
where scan_context_job_id is not null
  and cardinality(scan_context_job_ids) = 0;

create or replace function public.validate_receipt_capture_destinations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.scan_context_job_ids := coalesce(new.scan_context_job_ids, '{}'::uuid[]);

  -- Keep legacy single-job writes coherent while the array is the durable source of truth.
  if tg_op = 'INSERT'
    and cardinality(new.scan_context_job_ids) = 0
    and new.scan_context_job_id is not null then
    new.scan_context_job_ids := array[new.scan_context_job_id];
  elsif tg_op = 'UPDATE'
    and new.scan_context_job_ids is not distinct from old.scan_context_job_ids
    and new.scan_context_job_id is distinct from old.scan_context_job_id then
    new.scan_context_job_ids := case
      when new.scan_context_job_id is null then '{}'::uuid[]
      else array[new.scan_context_job_id]
    end;
    new.scan_context_includes_inventory := new.scan_context_job_id is null;
  end if;

  if array_position(new.scan_context_job_ids, null) is not null
    or exists (
      select 1
      from unnest(new.scan_context_job_ids) job_id
      group by job_id
      having count(*) > 1
    ) then
    raise exception 'Receipt destinations must be unique, valid jobs.';
  end if;

  if exists (
    select 1
    from unnest(new.scan_context_job_ids) destination_job_id
    left join public.jobs job on job.id = destination_job_id
    where job.id is null
      or job.business_id is distinct from new.business_id
  ) then
    raise exception 'Receipt destination does not belong to this business.';
  end if;

  new.scan_context_job_id := case
    when cardinality(new.scan_context_job_ids) = 1 then new.scan_context_job_ids[1]
    else null
  end;

  return new;
end;
$$;

drop trigger if exists validate_receipt_capture_destinations on public.receipts;
create trigger validate_receipt_capture_destinations
before insert or update of scan_context_job_id, scan_context_job_ids, scan_context_includes_inventory
on public.receipts
for each row
execute function public.validate_receipt_capture_destinations();

-- A discount cannot reduce the purchase when item rows plus tax already equal the amount paid.
-- Repair only receipts that have not been financially committed, including the reported Menards
-- mail-in rebate receipt, so users can finish review without rescanning.
do $$
declare
  v_receipt_ids uuid[];
begin
  select array_agg(candidate.receipt_id)
  into v_receipt_ids
  from (
    select receipt.id as receipt_id
    from public.receipts receipt
    join public.receipt_line_items line_item on line_item.receipt_id = receipt.id
    where receipt.status not in ('accepted', 'voided')
      and receipt.review_status <> 'reviewed'
      and receipt.total is not null
    group by receipt.id, receipt.tax, receipt.total
    having coalesce(sum(line_item.line_total) filter (where line_item.line_type = 'item'), 0) > 0
      and coalesce(sum(line_item.line_total) filter (where line_item.line_type = 'discount'), 0) > 0
      and abs(
        round(
          coalesce(sum(line_item.line_total) filter (where line_item.line_type = 'item'), 0)
            + coalesce(receipt.tax, 0),
          2
        ) - receipt.total
      ) <= 0.05
  ) candidate;

  if coalesce(cardinality(v_receipt_ids), 0) = 0 then
    return;
  end if;

  update public.receipts receipt
  set
    error_message = case
      when receipt.error_message like 'The extracted receipt total (%) does not match the line-derived total (%)%'
        then null
      else receipt.error_message
    end,
    extracted_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(receipt.extracted_json, '{}'::jsonb),
          '{line_items}',
          coalesce(
            (
              select jsonb_agg(line_value order by line_ordinality)
              from jsonb_array_elements(
                case
                  when jsonb_typeof(receipt.extracted_json->'line_items') = 'array'
                    then receipt.extracted_json->'line_items'
                  else '[]'::jsonb
                end
              ) with ordinality as extracted_line(line_value, line_ordinality)
              where extracted_line.line_value->>'line_type' <> 'discount'
            ),
            '[]'::jsonb
          ),
          true
        ),
        '{computed_total}',
        to_jsonb(receipt.total),
        true
      ),
      '{total_discrepancy}',
      '0'::jsonb,
      true
    ),
    updated_at = now()
  where receipt.id = any(v_receipt_ids);

  delete from public.receipt_line_items
  where receipt_id = any(v_receipt_ids)
    and line_type = 'discount';
end;
$$;
