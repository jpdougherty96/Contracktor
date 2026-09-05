-- Harden receipt normalization commits and surface intentional receipt errors.

create or replace function public.guard_invoiced_receipt_expense_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice_number text;
begin
  if old.receipt_id is null then
    return old;
  end if;

  select invoice.invoice_number
  into v_invoice_number
  from public.invoice_expenses link
  join public.invoices invoice on invoice.id = link.invoice_id
  where link.expense_id = old.id
  order by invoice.created_at desc
  limit 1;

  if v_invoice_number is not null then
    raise exception 'CTX:This receipt is on invoice %. Void or edit the invoice first.', v_invoice_number;
  end if;

  return old;
end;
$$;

drop trigger if exists guard_invoiced_receipt_expense_delete on public.expenses;
create trigger guard_invoiced_receipt_expense_delete
before delete on public.expenses
for each row execute function public.guard_invoiced_receipt_expense_delete();

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
  v_discount_total numeric := 0;
  v_cost_basis text;
  v_review_version integer;
  v_activity_job_id uuid;
  v_need_ids uuid[];
begin
  if v_actor is null then
    raise exception 'CTX:You must be logged in to review a receipt.';
  end if;

  if p_receipt_id is null then
    raise exception 'CTX:receipt_id is required.';
  end if;

  if p_idempotency_key is null
    or length(trim(p_idempotency_key)) < 8
    or length(trim(p_idempotency_key)) > 200 then
    raise exception 'CTX:A valid receipt commit identity is required.';
  end if;

  if p_review is null or jsonb_typeof(p_review) <> 'object' then
    raise exception 'CTX:Receipt review payload must be an object.';
  end if;

  select *
  into v_receipt
  from public.receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'CTX:Receipt not found.';
  end if;

  if not public.user_can_manage_business(v_receipt.business_id) then
    raise exception 'CTX:You do not have permission to review this receipt.';
  end if;

  if v_receipt.status = 'voided' then
    raise exception 'CTX:A voided receipt cannot be reviewed.';
  end if;

  v_fingerprint := md5(p_review::text);

  select *
  into v_existing_commit
  from public.receipt_review_commits
  where receipt_id = p_receipt_id
    and idempotency_key = trim(p_idempotency_key);

  if found then
    if v_existing_commit.request_fingerprint <> v_fingerprint then
      raise exception 'CTX:This receipt commit identity was already used for a different review.';
    end if;

    if v_receipt.last_review_commit_key is distinct from trim(p_idempotency_key) then
      raise exception 'CTX:This receipt review was superseded by a newer correction.';
    end if;

    return v_existing_commit.result;
  end if;

  if v_receipt.processing_status <> 'complete' then
    raise exception 'CTX:Wait for receipt processing to finish before saving.';
  end if;

  if p_expected_updated_at is not null
    and v_receipt.updated_at is distinct from p_expected_updated_at then
    raise exception 'CTX:This receipt changed after it was opened. Reload it and review the latest values.';
  end if;

  v_mode := p_review->>'mode';

  if v_mode is null or v_mode not in ('whole', 'lines') then
    raise exception 'CTX:Receipt review mode must be whole or lines.';
  end if;

  v_vendor := nullif(trim(p_review->>'vendor'), '');
  v_receipt_date := nullif(p_review->>'receiptDate', '')::date;
  v_subtotal := nullif(p_review->>'subtotal', '')::numeric;
  v_tax := nullif(p_review->>'tax', '')::numeric;
  v_total := nullif(p_review->>'total', '')::numeric;
  v_category := p_review->>'category';

  if v_vendor is null then
    raise exception 'CTX:Receipt vendor is required.';
  end if;

  if v_receipt_date is null then
    raise exception 'CTX:Receipt date is required.';
  end if;

  if v_receipt_date > current_date + 1
    or v_receipt_date < current_date - interval '3 years' then
    raise exception 'CTX:Receipt date must be within the last three years and cannot be in the future.';
  end if;

  if v_total is null or v_total <= 0 then
    raise exception 'CTX:Receipt amount paid must be greater than zero.';
  end if;

  if v_subtotal is not null and v_subtotal < 0 then
    raise exception 'CTX:Receipt subtotal cannot be negative.';
  end if;

  if v_tax is not null and v_tax < 0 then
    raise exception 'CTX:Receipt tax cannot be negative.';
  end if;

  if v_category is null
    or v_category not in ('materials', 'tools', 'fuel', 'subcontractor', 'permit', 'other') then
    raise exception 'CTX:Unsupported receipt category.';
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
      raise exception 'CTX:The amount applied from this receipt cannot be negative.';
    end if;

    if v_job_cost_amount > v_total then
      raise exception 'CTX:The amount applied cannot exceed the amount paid.';
    end if;

    if v_destination_job_id is not null and not exists (
      select 1
      from public.jobs job
      where job.id = v_destination_job_id
        and job.business_id = v_receipt.business_id
    ) then
      raise exception 'CTX:The selected job is not available to this business.';
    end if;

    if v_destination_job_id is null and v_category <> 'tools' then
      raise exception 'CTX:A whole receipt needs a job destination or the Tools / Inventory destination.';
    end if;

    select count(*) into v_line_count
    from public.receipt_line_items
    where receipt_id = p_receipt_id;

    if v_line_count > 0 and not v_ignore_line_items then
      raise exception 'CTX:Existing receipt lines require explicit dispositions.';
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
        when v_subtotal is not null and v_component_total > 0
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
      raise exception 'CTX:Receipt line assignments must be an array.';
    end if;

    select count(*) into v_line_count
    from public.receipt_line_items
    where receipt_id = p_receipt_id;

    if v_line_count = 0 then
      raise exception 'CTX:This receipt has no authoritative line items to assign.';
    end if;

    if v_line_count > 250 then
      raise exception 'CTX:This receipt has too many line items to save safely.';
    end if;

    select count(*) into v_assignment_count
    from jsonb_to_recordset(v_assignments)
      as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid);

    if v_assignment_count <> v_line_count then
      raise exception 'CTX:Every receipt line requires an explicit disposition.';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
      group by assignment.line_item_id
      having count(*) > 1
    ) then
      raise exception 'CTX:A receipt line cannot be assigned more than once.';
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
      raise exception 'CTX:A submitted receipt line does not belong to this receipt.';
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
      raise exception 'CTX:Every authoritative receipt line requires an explicit disposition.';
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
      raise exception 'CTX:A receipt line has an invalid disposition.';
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
      raise exception 'CTX:Tax, fee, discount, and summary lines must be ignored as line expenses.';
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
      raise exception 'CTX:A selected job is not available to this business.';
    end if;

    select coalesce(sum(line_total), 0)
    into v_item_total
    from public.receipt_line_items
    where receipt_id = p_receipt_id
      and line_type = 'item';

    select coalesce(sum(line_total), 0)
    into v_discount_total
    from public.receipt_line_items
    where receipt_id = p_receipt_id
      and line_type = 'discount';

    if v_discount_total > v_item_total + 0.05 then
      raise exception 'CTX:Receipt discounts cannot exceed the purchased item total.';
    end if;

    with parsed_assignments as (
      select *
      from jsonb_to_recordset(v_assignments)
        as assignment(line_item_id uuid, assignment_type text, assigned_job_id uuid)
    ), cost_rows as (
      select
        line_item.id,
        round(
          line_item.line_total
            - case
                when not v_allow_gross and v_item_total > 0
                  then v_discount_total * line_item.line_total / v_item_total
                else 0
              end
            + case
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
      raise exception 'CTX:Assigned receipt cost exceeds the amount paid. Choose amount paid or explicitly approve gross item costing.';
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
      round(
        line_item.line_total - case
          when not v_allow_gross and v_item_total > 0
            then v_discount_total * line_item.line_total / v_item_total
          else 0
        end,
        2
      ),
      round(
        case
          when v_item_total > 0 then coalesce(v_tax, 0) * line_item.line_total / v_item_total
          else 0
        end,
        2
      ),
      round(
        line_item.line_total
          - case
              when not v_allow_gross and v_item_total > 0
                then v_discount_total * line_item.line_total / v_item_total
              else 0
            end
          + case
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
      when v_allow_gross and v_discount_total > 0 then 'gross_items'
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
    last_processing_error = null,
    last_review_commit_key = trim(p_idempotency_key),
    processing_started_at = null,
    processing_status = 'complete',
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
