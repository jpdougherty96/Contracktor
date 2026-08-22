-- Receipt approval is a financial commit. Keep receipt state, line dispositions,
-- derived expenses, and the audit record inside one database transaction.

alter table public.receipts
add column if not exists allocated_cost numeric,
add column if not exists cost_basis text,
add column if not exists review_version integer not null default 0,
add column if not exists last_review_commit_key text,
add column if not exists voided_at timestamptz,
add column if not exists voided_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.receipts
drop constraint if exists receipts_cost_basis_check;

alter table public.receipts
add constraint receipts_cost_basis_check
check (cost_basis is null or cost_basis in ('amount_paid', 'partial_amount', 'line_items', 'gross_items'));

alter table public.receipts
drop constraint if exists receipts_allocated_cost_check;

alter table public.receipts
add constraint receipts_allocated_cost_check
check (allocated_cost is null or allocated_cost >= 0);

alter table public.receipts
drop constraint if exists receipts_status_check;

alter table public.receipts
add constraint receipts_status_check
check (status in ('processing', 'needs_review', 'accepted', 'error', 'voided'));

create table if not exists public.receipt_review_commits (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  committed_by_user_id uuid references public.profiles(id) on delete set null,
  idempotency_key text not null,
  request_fingerprint text not null,
  review_version integer not null,
  result jsonb not null default '{}'::jsonb,
  committed_at timestamptz not null default now(),
  constraint receipt_review_commits_key_check check (length(trim(idempotency_key)) between 8 and 200),
  constraint receipt_review_commits_fingerprint_check check (length(request_fingerprint) = 32),
  constraint receipt_review_commits_version_check check (review_version > 0),
  constraint receipt_review_commits_receipt_key_unique unique (receipt_id, idempotency_key),
  constraint receipt_review_commits_receipt_version_unique unique (receipt_id, review_version)
);

alter table public.receipt_review_commits enable row level security;

create policy "Business members can read receipt review commits"
on public.receipt_review_commits
for select
to authenticated
using (public.user_is_business_member(business_id));

revoke insert, update, delete on public.receipt_review_commits from authenticated;
grant select on public.receipt_review_commits to authenticated;

create index if not exists receipt_review_commits_business_committed_idx
on public.receipt_review_commits (business_id, committed_at desc);

-- Receipt-driven shopping fulfillment must also converge under retries.
delete from public.shopping_need_fulfillments duplicate
using public.shopping_need_fulfillments canonical
where duplicate.id > canonical.id
  and duplicate.shopping_need_id = canonical.shopping_need_id
  and duplicate.source_type = canonical.source_type
  and duplicate.source_id = canonical.source_id
  and duplicate.source_id is not null;

create unique index if not exists shopping_need_fulfillments_source_unique
on public.shopping_need_fulfillments (shopping_need_id, source_type, source_id);

create or replace function public.guard_receipt_financial_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.receipt_financial_commit', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and old.status in ('accepted', 'voided') then
    raise exception 'Accepted receipts must be voided through the receipt capability.';
  end if;

  if tg_op = 'UPDATE'
    and (old.status in ('accepted', 'voided') or new.status in ('accepted', 'voided')) then
    raise exception 'Accepted receipt state must be changed through the receipt capability.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_receipt_financial_state on public.receipts;
create trigger guard_receipt_financial_state
before update or delete on public.receipts
for each row execute function public.guard_receipt_financial_state();

create or replace function public.guard_receipt_derived_expense()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source_type text;
  v_receipt_id uuid;
begin
  if current_setting('app.receipt_financial_commit', true) = 'on' then
    return coalesce(new, old);
  end if;

  v_source_type := case when tg_op = 'DELETE' then old.source_type else new.source_type end;
  v_receipt_id := case when tg_op = 'DELETE' then old.receipt_id else new.receipt_id end;

  if v_receipt_id is not null and v_source_type in ('receipt', 'receipt_line_item') then
    raise exception 'Receipt-derived expenses must be changed through the receipt capability.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_receipt_derived_expense on public.expenses;
create trigger guard_receipt_derived_expense
before insert or update or delete on public.expenses
for each row execute function public.guard_receipt_derived_expense();

create or replace function public.commit_receipt_review(
  p_receipt_id uuid,
  p_idempotency_key text,
  p_expected_updated_at timestamptz,
  p_review jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_receipt public.receipts;
  v_existing_commit public.receipt_review_commits;
  v_commit_id uuid;
  v_result jsonb;
  v_fingerprint text;
  v_mode text;
  v_vendor text;
  v_receipt_date date;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_category text;
  v_destination_job_id uuid;
  v_job_cost_amount numeric;
  v_ignore_line_items boolean;
  v_allow_gross boolean;
  v_assignments jsonb;
  v_line_count integer;
  v_assignment_count integer;
  v_expense_count integer := 0;
  v_allocated_cost numeric := 0;
  v_allocated_tax numeric := 0;
  v_component_total numeric := 0;
  v_item_total numeric := 0;
  v_cost_basis text;
  v_review_version integer;
  v_activity_job_id uuid;
  v_need_ids uuid[];
begin
  if v_actor is null then
    raise exception 'You must be logged in to review a receipt.';
  end if;

  if p_receipt_id is null then
    raise exception 'receipt_id is required.';
  end if;

  if p_idempotency_key is null
    or length(trim(p_idempotency_key)) < 8
    or length(trim(p_idempotency_key)) > 200 then
    raise exception 'A valid receipt commit identity is required.';
  end if;

  if p_review is null or jsonb_typeof(p_review) <> 'object' then
    raise exception 'Receipt review payload must be an object.';
  end if;

  select *
  into v_receipt
  from public.receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  if not public.user_can_manage_business(v_receipt.business_id) then
    raise exception 'You do not have permission to review this receipt.';
  end if;

  if v_receipt.status = 'voided' then
    raise exception 'A voided receipt cannot be reviewed.';
  end if;

  v_fingerprint := md5(p_review::text);

  select *
  into v_existing_commit
  from public.receipt_review_commits
  where receipt_id = p_receipt_id
    and idempotency_key = trim(p_idempotency_key);

  if found then
    if v_existing_commit.request_fingerprint <> v_fingerprint then
      raise exception 'This receipt commit identity was already used for a different review.';
    end if;

    if v_receipt.last_review_commit_key is distinct from trim(p_idempotency_key) then
      raise exception 'This receipt review was superseded by a newer correction.';
    end if;

    return v_existing_commit.result;
  end if;

  if p_expected_updated_at is not null
    and v_receipt.updated_at is distinct from p_expected_updated_at then
    raise exception 'This receipt changed after it was opened. Reload it and review the latest values.';
  end if;

  v_mode := p_review->>'mode';

  if v_mode is null or v_mode not in ('whole', 'lines') then
    raise exception 'Receipt review mode must be whole or lines.';
  end if;

  v_vendor := nullif(trim(p_review->>'vendor'), '');
  v_receipt_date := nullif(p_review->>'receiptDate', '')::date;
  v_subtotal := nullif(p_review->>'subtotal', '')::numeric;
  v_tax := nullif(p_review->>'tax', '')::numeric;
  v_total := nullif(p_review->>'total', '')::numeric;
  v_category := p_review->>'category';

  if v_vendor is null then
    raise exception 'Receipt vendor is required.';
  end if;

  if v_receipt_date is null then
    raise exception 'Receipt date is required.';
  end if;

  if v_total is null or v_total <= 0 then
    raise exception 'Receipt amount paid must be greater than zero.';
  end if;

  if v_subtotal is not null and v_subtotal < 0 then
    raise exception 'Receipt subtotal cannot be negative.';
  end if;

  if v_tax is not null and v_tax < 0 then
    raise exception 'Receipt tax cannot be negative.';
  end if;

  if v_category is null
    or v_category not in ('materials', 'tools', 'fuel', 'subcontractor', 'permit', 'other') then
    raise exception 'Unsupported receipt category.';
  end if;

  select array_agg(distinct shopping_need_id)
  into v_need_ids
  from public.shopping_need_fulfillments
  where source_type = 'receipt'
    and source_id = p_receipt_id;

  delete from public.shopping_need_fulfillments
  where source_type = 'receipt'
    and source_id = p_receipt_id;

  if v_need_ids is not null then
    update public.shopping_needs need
    set
      completed_at = null,
      status = 'open',
      updated_at = now()
    where need.id = any(v_need_ids)
      and need.status = 'fulfilled'
      and not exists (
        select 1
        from public.shopping_need_fulfillments remaining
        where remaining.shopping_need_id = need.id
      );
  end if;

  perform set_config('app.receipt_financial_commit', 'on', true);

  delete from public.expenses
  where receipt_id = p_receipt_id;

  if v_mode = 'whole' then
    v_destination_job_id := nullif(p_review->>'destinationJobId', '')::uuid;
    v_job_cost_amount := nullif(p_review->>'jobCostAmount', '')::numeric;
    v_ignore_line_items := coalesce((p_review->>'ignoreLineItems')::boolean, false);

    if v_job_cost_amount is null or v_job_cost_amount < 0 then
      raise exception 'The amount applied from this receipt cannot be negative.';
    end if;

    if v_job_cost_amount > v_total then
      raise exception 'The amount applied cannot exceed the amount paid.';
    end if;

    if v_destination_job_id is not null and not exists (
      select 1
      from public.jobs job
      where job.id = v_destination_job_id
        and job.business_id = v_receipt.business_id
    ) then
      raise exception 'The selected job is not available to this business.';
    end if;

    if v_destination_job_id is null and v_category <> 'tools' then
      raise exception 'A whole receipt needs a job destination or the Tools / Inventory destination.';
    end if;

    select count(*) into v_line_count
    from public.receipt_line_items
    where receipt_id = p_receipt_id;

    if v_line_count > 0 and not v_ignore_line_items then
      raise exception 'Existing receipt lines require explicit dispositions.';
    end if;

    if v_line_count > 0 then
      update public.receipt_line_items
      set
        assigned_job_id = null,
        assignment_type = 'ignore',
        review_status = 'ignored',
        updated_at = now()
      where receipt_id = p_receipt_id;
    end if;

    if v_job_cost_amount > 0 then
      v_component_total := coalesce(v_subtotal, 0) + coalesce(v_tax, 0);
      v_allocated_tax := case
        when v_component_total > 0
          then round(v_job_cost_amount * coalesce(v_tax, 0) / v_component_total, 2)
        else 0
      end;

      insert into public.expenses (
        owner_id,
        business_id,
        created_by_user_id,
        job_id,
        receipt_id,
        receipt_line_item_id,
        description,
        expense_date,
        expense_type,
        source_type,
        pre_tax_amount,
        tax_amount,
        total_amount,
        billable,
        status,
        notes,
        updated_at
      )
      values (
        v_receipt.owner_id,
        v_receipt.business_id,
        v_actor,
        v_destination_job_id,
        p_receipt_id,
        null,
        v_vendor || ' receipt',
        v_receipt_date,
        case v_category
          when 'materials' then 'material'
          when 'tools' then 'tool'
          when 'fuel' then 'fuel'
          when 'subcontractor' then 'subcontractor'
          when 'permit' then 'permit'
          else 'other'
        end,
        'receipt',
        round(v_job_cost_amount - v_allocated_tax, 2),
        v_allocated_tax,
        round(v_job_cost_amount, 2),
        false,
        'reviewed',
        case
          when v_component_total > v_total + 0.05 then 'Net amount paid after receipt adjustments.'
          when v_job_cost_amount < v_total then 'Partial amount from receipt.'
          else null
        end,
        now()
      );

      v_expense_count := 1;
    end if;

    v_allocated_cost := round(v_job_cost_amount, 2);
    v_cost_basis := case
      when abs(v_job_cost_amount - v_total) <= 0.005 then 'amount_paid'
      else 'partial_amount'
    end;
    v_activity_job_id := v_destination_job_id;
  else
    v_allow_gross := coalesce((p_review->>'allowGrossLineCost')::boolean, false);
    v_assignments := coalesce(p_review->'assignments', '[]'::jsonb);

    if jsonb_typeof(v_assignments) <> 'array' then
      raise exception 'Receipt line assignments must be an array.';
    end if;

    select count(*) into v_line_count
    from public.receipt_line_items
    where receipt_id = p_receipt_id;

    if v_line_count = 0 then
      raise exception 'This receipt has no authoritative line items to assign.';
    end if;

    select count(*) into v_assignment_count
    from jsonb_to_recordset(v_assignments)
      as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid);

    if v_assignment_count <> v_line_count then
      raise exception 'Every receipt line requires an explicit disposition.';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
      group by assignment.line_item_id
      having count(*) > 1
    ) then
      raise exception 'A receipt line cannot be assigned more than once.';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
      left join public.receipt_line_items line_item
        on line_item.id = assignment.line_item_id
        and line_item.receipt_id = p_receipt_id
      where line_item.id is null
    ) then
      raise exception 'A submitted receipt line does not belong to this receipt.';
    end if;

    if exists (
      select 1
      from public.receipt_line_items line_item
      where line_item.receipt_id = p_receipt_id
        and not exists (
          select 1
          from jsonb_to_recordset(v_assignments)
            as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
          where assignment.line_item_id = line_item.id
        )
    ) then
      raise exception 'Every authoritative receipt line requires an explicit disposition.';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
      where assignment.assignment_type is null
        or assignment.assignment_type not in ('job', 'tools_inventory', 'ignore')
        or (assignment.assignment_type = 'job' and assignment.assigned_job_id is null)
        or (assignment.assignment_type <> 'job' and assignment.assigned_job_id is not null)
    ) then
      raise exception 'A receipt line has an invalid disposition.';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
      join public.receipt_line_items line_item
        on line_item.id = assignment.line_item_id
        and line_item.receipt_id = p_receipt_id
      where line_item.line_type <> 'item'
        and assignment.assignment_type <> 'ignore'
    ) then
      raise exception 'Tax, fee, discount, and summary lines must be ignored as line expenses.';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
      left join public.jobs job
        on job.id = assignment.assigned_job_id
        and job.business_id = v_receipt.business_id
      where assignment.assignment_type = 'job'
        and job.id is null
    ) then
      raise exception 'A selected job is not available to this business.';
    end if;

    select coalesce(sum(line_total), 0)
    into v_item_total
    from public.receipt_line_items
    where receipt_id = p_receipt_id
      and line_type = 'item';

    with parsed_assignments as (
      select *
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
    ), cost_rows as (
      select
        line_item.id,
        round(
          line_item.line_total + case
            when v_item_total > 0 then coalesce(v_tax, 0) * line_item.line_total / v_item_total
            else 0
          end,
          2
        ) as line_cost
      from public.receipt_line_items line_item
      join parsed_assignments assignment on assignment.line_item_id = line_item.id
      where line_item.receipt_id = p_receipt_id
        and line_item.line_type = 'item'
        and assignment.assignment_type <> 'ignore'
    )
    select coalesce(sum(line_cost), 0)
    into v_allocated_cost
    from cost_rows;

    v_allocated_cost := round(v_allocated_cost, 2);

    if not v_allow_gross and v_allocated_cost > v_total + 0.05 then
      raise exception 'Assigned receipt cost exceeds the amount paid. Choose amount paid or explicitly approve gross item costing.';
    end if;

    with parsed_assignments as (
      select *
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
    )
    update public.receipt_line_items line_item
    set
      assigned_job_id = case when assignment.assignment_type = 'job' then assignment.assigned_job_id else null end,
      assignment_type = assignment.assignment_type,
      review_status = case
        when line_item.line_type <> 'item' or assignment.assignment_type = 'ignore' then 'ignored'
        else 'confirmed'
      end,
      updated_at = now()
    from parsed_assignments assignment
    where line_item.id = assignment.line_item_id
      and line_item.receipt_id = p_receipt_id;

    with parsed_assignments as (
      select *
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
    )
    insert into public.expenses (
      owner_id,
      business_id,
      created_by_user_id,
      job_id,
      receipt_id,
      receipt_line_item_id,
      description,
      expense_date,
      expense_type,
      source_type,
      pre_tax_amount,
      tax_amount,
      total_amount,
      billable,
      status,
      notes,
      updated_at
    )
    select
      v_receipt.owner_id,
      v_receipt.business_id,
      v_actor,
      case when assignment.assignment_type = 'job' then assignment.assigned_job_id else null end,
      p_receipt_id,
      line_item.id,
      line_item.cleaned_name,
      v_receipt_date,
      case
        when assignment.assignment_type = 'tools_inventory' and line_item.category = 'inventory' then 'inventory'
        when assignment.assignment_type = 'tools_inventory' then 'tool'
        when line_item.category = 'material' then 'material'
        when line_item.category = 'tool' then 'tool'
        when line_item.category = 'inventory' then 'inventory'
        when line_item.category = 'rental' then 'rental'
        when line_item.category = 'permit' then 'permit'
        when line_item.category = 'subcontractor' then 'subcontractor'
        when line_item.category = 'fuel' then 'fuel'
        else 'other'
      end,
      'receipt_line_item',
      round(line_item.line_total, 2),
      round(
        case
          when v_item_total > 0 then coalesce(v_tax, 0) * line_item.line_total / v_item_total
          else 0
        end,
        2
      ),
      round(
        line_item.line_total + case
          when v_item_total > 0 then coalesce(v_tax, 0) * line_item.line_total / v_item_total
          else 0
        end,
        2
      ),
      false,
      'reviewed',
      case
        when line_item.original_text is not null
          and line_item.original_text <> line_item.cleaned_name
          then 'Receipt text: ' || line_item.original_text
        else null
      end,
      now()
    from public.receipt_line_items line_item
    join parsed_assignments assignment on assignment.line_item_id = line_item.id
    where line_item.receipt_id = p_receipt_id
      and line_item.line_type = 'item'
      and assignment.assignment_type <> 'ignore';

    get diagnostics v_expense_count = row_count;

    select case when count(distinct assignment.assigned_job_id) = 1
      then min(assignment.assigned_job_id::text)::uuid
      else null
    end
    into v_activity_job_id
    from jsonb_to_recordset(v_assignments)
      as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
    where assignment.assignment_type = 'job';

    v_cost_basis := case
      when v_allow_gross and v_allocated_cost > v_total + 0.05 then 'gross_items'
      else 'line_items'
    end;
  end if;

  v_review_version := v_receipt.review_version + 1;

  update public.receipts
  set
    allocated_cost = v_allocated_cost,
    category = v_category,
    cost_basis = v_cost_basis,
    error_message = null,
    last_review_commit_key = trim(p_idempotency_key),
    receipt_date = v_receipt_date,
    review_status = 'reviewed',
    review_version = v_review_version,
    scan_context_job_id = case when v_mode = 'whole' then v_destination_job_id else scan_context_job_id end,
    status = 'accepted',
    subtotal = v_subtotal,
    tax = v_tax,
    total = v_total,
    updated_at = now(),
    vendor = v_vendor,
    voided_at = null,
    voided_by_user_id = null
  where id = p_receipt_id;

  v_commit_id := gen_random_uuid();
  v_result := jsonb_build_object(
    'allocatedCost', v_allocated_cost,
    'costBasis', v_cost_basis,
    'expenseCount', v_expense_count,
    'idempotencyKey', trim(p_idempotency_key),
    'mode', v_mode,
    'receiptId', p_receipt_id,
    'reviewVersion', v_review_version,
    'status', 'accepted'
  );

  insert into public.receipt_review_commits (
    id,
    receipt_id,
    business_id,
    owner_id,
    committed_by_user_id,
    idempotency_key,
    request_fingerprint,
    review_version,
    result
  ) values (
    v_commit_id,
    p_receipt_id,
    v_receipt.business_id,
    v_receipt.owner_id,
    v_actor,
    trim(p_idempotency_key),
    v_fingerprint,
    v_review_version,
    v_result
  );

  insert into public.activity_events (
    business_id,
    owner_id,
    actor_user_id,
    created_by_user_id,
    job_id,
    event_type,
    status,
    severity,
    source_table,
    source_id,
    title,
    detail,
    metadata,
    occurred_at,
    resolved_at
  ) values (
    v_receipt.business_id,
    v_receipt.owner_id,
    v_actor,
    v_actor,
    v_activity_job_id,
    'receipt_review_committed',
    'completed',
    'normal',
    'receipt_review_commits',
    v_commit_id,
    case when v_mode = 'lines' then 'Receipt split saved' else 'Receipt saved' end,
    v_vendor || ' - $' || to_char(v_allocated_cost, 'FM999999999990.00'),
    jsonb_build_object(
      'allocatedCost', v_allocated_cost,
      'costBasis', v_cost_basis,
      'expenseCount', v_expense_count,
      'receiptId', p_receipt_id,
      'reviewVersion', v_review_version
    ),
    now(),
    now()
  );

  update public.attention_items
  set
    resolution_note = 'Receipt reviewed and saved.',
    resolved_at = now(),
    resolved_by_user_id = v_actor,
    status = 'resolved',
    updated_at = now()
  where business_id = v_receipt.business_id
    and source_table = 'receipts'
    and source_id = p_receipt_id
    and status = 'open';

  return v_result;
end;
$$;

revoke all on function public.commit_receipt_review(uuid, text, timestamptz, jsonb) from public;
grant execute on function public.commit_receipt_review(uuid, text, timestamptz, jsonb) to authenticated;

create or replace function public.require_receipt_line_review(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_receipt public.receipts;
  v_need_ids uuid[];
begin
  if v_actor is null then
    raise exception 'You must be logged in to update a receipt.';
  end if;

  select * into v_receipt
  from public.receipts
  where id = p_receipt_id
  for update;

  if not found or not public.user_can_manage_business(v_receipt.business_id) then
    raise exception 'Receipt not found or unavailable.';
  end if;

  if v_receipt.status = 'voided' then
    raise exception 'A voided receipt cannot be changed.';
  end if;

  select array_agg(distinct shopping_need_id)
  into v_need_ids
  from public.shopping_need_fulfillments
  where source_type = 'receipt' and source_id = p_receipt_id;

  delete from public.shopping_need_fulfillments
  where source_type = 'receipt' and source_id = p_receipt_id;

  if v_need_ids is not null then
    update public.shopping_needs need
    set completed_at = null, status = 'open', updated_at = now()
    where need.id = any(v_need_ids)
      and need.status = 'fulfilled'
      and not exists (
        select 1 from public.shopping_need_fulfillments remaining
        where remaining.shopping_need_id = need.id
      );
  end if;

  perform set_config('app.receipt_financial_commit', 'on', true);

  delete from public.expenses where receipt_id = p_receipt_id;

  update public.receipts
  set
    allocated_cost = null,
    cost_basis = null,
    error_message = 'This receipt was selected for multiple jobs and needs line items before it can be saved.',
    review_status = 'needs_review',
    status = 'needs_review',
    updated_at = now()
  where id = p_receipt_id
  returning * into v_receipt;

  return jsonb_build_object(
    'receiptId', v_receipt.id,
    'reviewStatus', v_receipt.review_status,
    'status', v_receipt.status
  );
end;
$$;

revoke all on function public.require_receipt_line_review(uuid) from public;
grant execute on function public.require_receipt_line_review(uuid) to authenticated;

create or replace function public.remove_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_receipt public.receipts;
  v_need_ids uuid[];
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'You must be logged in to remove a receipt.';
  end if;

  select * into v_receipt
  from public.receipts
  where id = p_receipt_id
  for update;

  if not found or not public.user_can_manage_business(v_receipt.business_id) then
    raise exception 'Receipt not found or unavailable.';
  end if;

  if v_receipt.status = 'voided' then
    return jsonb_build_object(
      'action', 'voided',
      'receiptId', p_receipt_id,
      'storagePath', null
    );
  end if;

  select array_agg(distinct shopping_need_id)
  into v_need_ids
  from public.shopping_need_fulfillments
  where source_type = 'receipt' and source_id = p_receipt_id;

  delete from public.shopping_need_fulfillments
  where source_type = 'receipt' and source_id = p_receipt_id;

  if v_need_ids is not null then
    update public.shopping_needs need
    set completed_at = null, status = 'open', updated_at = now()
    where need.id = any(v_need_ids)
      and need.status = 'fulfilled'
      and not exists (
        select 1 from public.shopping_need_fulfillments remaining
        where remaining.shopping_need_id = need.id
      );
  end if;

  perform set_config('app.receipt_financial_commit', 'on', true);
  delete from public.expenses where receipt_id = p_receipt_id;

  if v_receipt.status = 'accepted' then
    update public.receipts
    set
      status = 'voided',
      voided_at = now(),
      voided_by_user_id = v_actor,
      updated_at = now()
    where id = p_receipt_id;

    insert into public.activity_events (
      business_id,
      owner_id,
      actor_user_id,
      created_by_user_id,
      job_id,
      event_type,
      status,
      severity,
      source_table,
      source_id,
      title,
      detail,
      metadata,
      occurred_at,
      resolved_at
    ) values (
      v_receipt.business_id,
      v_receipt.owner_id,
      v_actor,
      v_actor,
      v_receipt.scan_context_job_id,
      'receipt_voided',
      'completed',
      'normal',
      'receipts',
      p_receipt_id,
      'Receipt voided',
      coalesce(v_receipt.vendor, 'Receipt') || ' removed from recorded costs.',
      jsonb_build_object(
        'allocatedCost', v_receipt.allocated_cost,
        'costBasis', v_receipt.cost_basis,
        'receiptId', p_receipt_id
      ),
      now(),
      now()
    )
    on conflict (business_id, event_type, source_table, source_id)
    do nothing;

    update public.attention_items
    set
      resolution_note = 'Receipt voided.',
      resolved_at = now(),
      resolved_by_user_id = v_actor,
      status = 'resolved',
      updated_at = now()
    where business_id = v_receipt.business_id
      and source_table = 'receipts'
      and source_id = p_receipt_id
      and status = 'open';

    return jsonb_build_object(
      'action', 'voided',
      'receiptId', p_receipt_id,
      'storagePath', null
    );
  end if;

  delete from public.attention_items
  where business_id = v_receipt.business_id
    and source_table = 'receipts'
    and source_id = p_receipt_id;

  delete from public.activity_events
  where business_id = v_receipt.business_id
    and source_table = 'receipts'
    and source_id = p_receipt_id;

  v_result := jsonb_build_object(
    'action', 'discarded',
    'receiptId', p_receipt_id,
    'storagePath', v_receipt.storage_path
  );

  delete from public.receipts where id = p_receipt_id;

  return v_result;
end;
$$;

revoke all on function public.remove_receipt(uuid) from public;
grant execute on function public.remove_receipt(uuid) to authenticated;
