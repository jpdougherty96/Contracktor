-- Invoice ledger v1: authoritative drafts, immutable finalized invoices, and
-- source-level attribution that prevents labor or expenses from being billed twice.

create table public.invoice_sequences (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint invoice_sequences_last_value_check check (last_value >= 0)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  invoice_number text not null,
  status text not null default 'draft',
  billing_model text not null,
  payment_request_type text not null default 'standard',
  issue_date date not null default current_date,
  due_date date,
  billing_period_start date,
  billing_period_end date,
  seller_snapshot jsonb not null default '{}'::jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  note text,
  terms text,
  material_markup_percent numeric not null default 0,
  contract_amount numeric not null default 0,
  retainage_amount numeric not null default 0,
  subtotal numeric not null default 0,
  amount_paid numeric not null default 0,
  balance_due numeric not null default 0,
  version integer not null default 1,
  creation_idempotency_key text not null,
  last_mutation_key text,
  finalized_by_user_id uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  voided_by_user_id uuid references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_number_check check (length(trim(invoice_number)) between 1 and 80),
  constraint invoices_status_check check (status in ('draft', 'finalized', 'void')),
  constraint invoices_billing_model_check
    check (billing_model in ('fixed_bid', 'time_and_materials')),
  constraint invoices_request_type_check
    check (payment_request_type in ('standard', 'deposit', 'progress', 'final')),
  constraint invoices_period_check
    check (
      billing_period_start is null
      or billing_period_end is null
      or billing_period_start <= billing_period_end
    ),
  constraint invoices_dates_check check (due_date is null or issue_date <= due_date),
  constraint invoices_markup_check
    check (material_markup_percent >= 0 and material_markup_percent <= 500),
  constraint invoices_amounts_check check (
    contract_amount >= 0
    and retainage_amount >= 0
    and amount_paid >= 0
  ),
  constraint invoices_version_check check (version > 0),
  constraint invoices_creation_key_check check (length(trim(creation_idempotency_key)) > 0),
  constraint invoices_business_number_unique unique (business_id, invoice_number),
  constraint invoices_creation_key_unique
    unique (created_by_user_id, creation_idempotency_key)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  line_type text not null,
  description text not null,
  detail text,
  quantity numeric not null default 1,
  unit text not null default 'each',
  unit_rate numeric not null default 0,
  amount numeric not null default 0,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_lines_type_check
    check (line_type in ('fixed_scope', 'labor', 'material', 'fee', 'change_order', 'other')),
  constraint invoice_lines_description_check check (length(trim(description)) between 1 and 500),
  constraint invoice_lines_quantity_check check (quantity >= 0),
  constraint invoice_lines_rate_check check (unit_rate >= 0),
  constraint invoice_lines_position_check check (position >= 0),
  constraint invoice_lines_invoice_id_id_unique unique (invoice_id, id)
);

create table public.invoice_time_entries (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  invoice_line_id uuid not null,
  time_entry_id uuid not null references public.time_entries(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  source_amount numeric not null,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (invoice_id, time_entry_id),
  constraint invoice_time_entries_line_fkey
    foreign key (invoice_id, invoice_line_id)
    references public.invoice_lines(invoice_id, id)
    on delete cascade,
  constraint invoice_time_entries_amount_check check (source_amount >= 0)
);

create table public.invoice_expenses (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  invoice_line_id uuid not null,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  source_amount numeric not null,
  source_status text not null,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (invoice_id, expense_id),
  constraint invoice_expenses_line_fkey
    foreign key (invoice_id, invoice_line_id)
    references public.invoice_lines(invoice_id, id)
    on delete cascade,
  constraint invoice_expenses_amount_check check (source_amount >= 0)
);

create table public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  idempotency_key text not null,
  invoice_number_snapshot text not null,
  invoice_version integer not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint invoice_events_type_check
    check (event_type in ('invoice_draft_created', 'invoice_draft_saved', 'invoice_finalized', 'invoice_voided')),
  constraint invoice_events_key_check check (length(trim(idempotency_key)) > 0),
  constraint invoice_events_version_check check (invoice_version > 0),
  constraint invoice_events_actor_key_unique unique (actor_user_id, idempotency_key)
);

alter table public.time_entries
add column invoice_id uuid references public.invoices(id) on delete restrict,
add column invoiced_at timestamptz;

alter table public.expenses
add column invoice_id uuid references public.invoices(id) on delete restrict,
add column invoiced_at timestamptz;

create index invoices_job_status_idx
on public.invoices (job_id, status, created_at desc);

create index invoices_business_status_idx
on public.invoices (business_id, status, issue_date desc);

create index invoice_lines_invoice_position_idx
on public.invoice_lines (invoice_id, position, created_at);

create index invoice_time_entries_source_idx
on public.invoice_time_entries (time_entry_id);

create index invoice_expenses_source_idx
on public.invoice_expenses (expense_id);

create index invoice_events_invoice_occurred_idx
on public.invoice_events (invoice_id, occurred_at desc);

alter table public.invoice_sequences enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_time_entries enable row level security;
alter table public.invoice_expenses enable row level security;
alter table public.invoice_events enable row level security;

create policy "Business managers can read invoices"
on public.invoices
for select
to authenticated
using (public.user_can_manage_business(business_id));

create policy "Business managers can read invoice lines"
on public.invoice_lines
for select
to authenticated
using (public.user_can_manage_business(business_id));

create policy "Business managers can read invoice time entries"
on public.invoice_time_entries
for select
to authenticated
using (public.user_can_manage_business(business_id));

create policy "Business managers can read invoice expenses"
on public.invoice_expenses
for select
to authenticated
using (public.user_can_manage_business(business_id));

create policy "Business managers can read invoice events"
on public.invoice_events
for select
to authenticated
using (public.user_can_manage_business(business_id));

grant select on public.invoices to authenticated;
grant select on public.invoice_lines to authenticated;
grant select on public.invoice_time_entries to authenticated;
grant select on public.invoice_expenses to authenticated;
grant select on public.invoice_events to authenticated;

revoke all on public.invoice_sequences from public, authenticated;
revoke insert, update, delete on public.invoices from authenticated;
revoke insert, update, delete on public.invoice_lines from authenticated;
revoke insert, update, delete on public.invoice_time_entries from authenticated;
revoke insert, update, delete on public.invoice_expenses from authenticated;
revoke insert, update, delete on public.invoice_events from authenticated;

create or replace function public.guard_invoice_source_attribution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'INSERT' and (new.invoice_id is not null or new.invoiced_at is not null) then
      raise exception 'Invoice attribution can only change through the invoice ledger.';
    end if;

    if tg_op = 'UPDATE'
      and (
        new.invoice_id is distinct from old.invoice_id
        or new.invoiced_at is distinct from old.invoiced_at
      )
    then
      raise exception 'Invoice attribution can only change through the invoice ledger.';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_new_time_entry_invoice_attribution
before insert on public.time_entries
for each row execute function public.guard_invoice_source_attribution();

create trigger protect_time_entry_invoice_attribution
before update of invoice_id, invoiced_at on public.time_entries
for each row execute function public.guard_invoice_source_attribution();

create trigger protect_new_expense_invoice_attribution
before insert on public.expenses
for each row execute function public.guard_invoice_source_attribution();

create trigger protect_expense_invoice_attribution
before update of invoice_id, invoiced_at on public.expenses
for each row execute function public.guard_invoice_source_attribution();

create or replace function public.get_invoice_bundle(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.user_can_manage_business(v_invoice.business_id) then
    raise exception 'Only a business owner or admin can view invoices.';
  end if;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'lines', coalesce(
      (
        select jsonb_agg(
          to_jsonb(l) || jsonb_build_object(
            'timeEntryIds', coalesce(
              (
                select jsonb_agg(ite.time_entry_id order by ite.time_entry_id)
                from public.invoice_time_entries ite
                where ite.invoice_line_id = l.id
              ),
              '[]'::jsonb
            ),
            'expenseIds', coalesce(
              (
                select jsonb_agg(ie.expense_id order by ie.expense_id)
                from public.invoice_expenses ie
                where ie.invoice_line_id = l.id
              ),
              '[]'::jsonb
            )
          )
          order by l.position, l.created_at, l.id
        )
        from public.invoice_lines l
        where l.invoice_id = v_invoice.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_invoice_bundle(uuid) from public;
grant execute on function public.get_invoice_bundle(uuid) to authenticated;

create or replace function public.get_job_invoice_draft(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select business_id into v_business_id from public.jobs where id = p_job_id;

  if v_business_id is null then
    raise exception 'Job not found.';
  end if;

  if not public.user_can_manage_business(v_business_id) then
    raise exception 'Only a business owner or admin can view invoices.';
  end if;

  select id
  into v_invoice_id
  from public.invoices
  where job_id = p_job_id
    and status = 'draft'
  order by updated_at desc, created_at desc
  limit 1;

  if v_invoice_id is null then
    return null;
  end if;

  return public.get_invoice_bundle(v_invoice_id);
end;
$$;

revoke all on function public.get_job_invoice_draft(uuid) from public;
grant execute on function public.get_job_invoice_draft(uuid) to authenticated;

create or replace function public.create_invoice_draft(
  p_job_id uuid,
  p_issue_date date,
  p_due_date date,
  p_billing_period_start date,
  p_billing_period_end date,
  p_payment_request_type text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.invoices;
  v_invoice public.invoices;
  v_job public.jobs;
  v_profile public.profiles;
  v_sequence bigint;
  v_request_type text;
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'An idempotency key is required.';
  end if;

  select *
  into v_existing
  from public.invoices
  where created_by_user_id = v_actor
    and creation_idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    if v_existing.job_id <> p_job_id then
      raise exception 'That invoice request key was already used for another job.';
    end if;
    return public.get_invoice_bundle(v_existing.id);
  end if;

  select * into v_job from public.jobs where id = p_job_id;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if not public.user_can_manage_business(v_job.business_id) then
    raise exception 'Only a business owner or admin can create invoices.';
  end if;

  if p_due_date is not null and coalesce(p_issue_date, current_date) > p_due_date then
    raise exception 'The due date cannot be before the issue date.';
  end if;

  if p_billing_period_start is not null
    and p_billing_period_end is not null
    and p_billing_period_start > p_billing_period_end
  then
    raise exception 'The billing period start cannot be after its end.';
  end if;

  v_request_type := coalesce(
    nullif(trim(p_payment_request_type), ''),
    case when v_job.job_type = 'fixed_bid' then 'progress' else 'standard' end
  );

  if v_request_type not in ('standard', 'deposit', 'progress', 'final') then
    raise exception 'Unsupported payment request type.';
  end if;

  select * into v_profile from public.profiles where id = v_job.owner_id;

  insert into public.invoice_sequences (business_id, last_value)
  values (v_job.business_id, 1)
  on conflict (business_id)
  do update set
    last_value = public.invoice_sequences.last_value + 1,
    updated_at = clock_timestamp()
  returning last_value into v_sequence;

  insert into public.invoices (
    business_id,
    owner_id,
    job_id,
    created_by_user_id,
    invoice_number,
    billing_model,
    payment_request_type,
    issue_date,
    due_date,
    billing_period_start,
    billing_period_end,
    seller_snapshot,
    customer_snapshot,
    note,
    terms,
    contract_amount,
    creation_idempotency_key
  )
  values (
    v_job.business_id,
    v_job.owner_id,
    v_job.id,
    v_actor,
    'INV-' || lpad(v_sequence::text, 5, '0'),
    v_job.job_type,
    v_request_type,
    coalesce(p_issue_date, current_date),
    p_due_date,
    p_billing_period_start,
    p_billing_period_end,
    jsonb_build_object(
      'name', coalesce(nullif(trim(v_profile.company_name), ''), nullif(trim(v_profile.full_name), ''), ''),
      'contactName', case when nullif(trim(v_profile.company_name), '') is not null then v_profile.full_name else null end,
      'email', v_profile.invoice_email,
      'phone', v_profile.phone,
      'addressLine1', v_profile.address_line_1,
      'addressLine2', v_profile.address_line_2,
      'city', v_profile.city,
      'state', v_profile.state,
      'postalCode', v_profile.postal_code,
      'website', v_profile.website
    ),
    jsonb_build_object(
      'name', v_job.client_name,
      'jobName', v_job.name,
      'serviceAddress', v_job.location
    ),
    v_profile.default_invoice_note,
    v_profile.default_invoice_terms,
    coalesce(v_job.quote_amount, 0),
    trim(p_idempotency_key)
  )
  returning * into v_invoice;

  insert into public.invoice_events (
    invoice_id,
    business_id,
    owner_id,
    job_id,
    actor_user_id,
    event_type,
    idempotency_key,
    invoice_number_snapshot,
    invoice_version
  )
  values (
    v_invoice.id,
    v_invoice.business_id,
    v_invoice.owner_id,
    v_invoice.job_id,
    v_actor,
    'invoice_draft_created',
    trim(p_idempotency_key) || ':created',
    v_invoice.invoice_number,
    v_invoice.version
  );

  return public.get_invoice_bundle(v_invoice.id);
end;
$$;

revoke all on function public.create_invoice_draft(
  uuid,
  date,
  date,
  date,
  date,
  text,
  text
) from public;
grant execute on function public.create_invoice_draft(
  uuid,
  date,
  date,
  date,
  date,
  text,
  text
) to authenticated;

create or replace function public.save_invoice_draft(
  p_invoice_id uuid,
  p_expected_version integer,
  p_issue_date date,
  p_due_date date,
  p_billing_period_start date,
  p_billing_period_end date,
  p_note text,
  p_terms text,
  p_material_markup_percent numeric,
  p_retainage_amount numeric,
  p_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_event public.invoice_events;
  v_invoice public.invoices;
  v_line public.invoice_lines;
  v_line_json jsonb;
  v_time_entry public.time_entries;
  v_expense public.expenses;
  v_source_id uuid;
  v_line_type text;
  v_description text;
  v_detail text;
  v_quantity numeric;
  v_unit text;
  v_unit_rate numeric;
  v_amount numeric;
  v_position integer := 0;
  v_subtotal numeric := 0;
  v_markup numeric := coalesce(p_material_markup_percent, 0);
  v_retainage numeric := coalesce(p_retainage_amount, 0);
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'An idempotency key is required.';
  end if;

  select *
  into v_existing_event
  from public.invoice_events
  where actor_user_id = v_actor
    and idempotency_key = trim(p_idempotency_key);

  if v_existing_event.id is not null then
    if v_existing_event.invoice_id <> p_invoice_id
      or v_existing_event.event_type <> 'invoice_draft_saved'
    then
      raise exception 'That invoice request key was already used.';
    end if;
    return public.get_invoice_bundle(p_invoice_id);
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.user_can_manage_business(v_invoice.business_id) then
    raise exception 'Only a business owner or admin can save invoices.';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'Only draft invoices can be changed.';
  end if;

  if p_expected_version is not null and v_invoice.version <> p_expected_version then
    raise exception 'This invoice changed after you opened it. Refresh and try again.';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one invoice line.';
  end if;

  if jsonb_array_length(p_lines) > 200 then
    raise exception 'An invoice cannot contain more than 200 lines.';
  end if;

  if p_due_date is not null and coalesce(p_issue_date, v_invoice.issue_date) > p_due_date then
    raise exception 'The due date cannot be before the issue date.';
  end if;

  if p_billing_period_start is not null
    and p_billing_period_end is not null
    and p_billing_period_start > p_billing_period_end
  then
    raise exception 'The billing period start cannot be after its end.';
  end if;

  if v_markup < 0 or v_markup > 500 then
    raise exception 'Materials markup must be between 0 and 500 percent.';
  end if;

  if v_retainage < 0 then
    raise exception 'Retainage cannot be negative.';
  end if;

  delete from public.invoice_lines where invoice_id = v_invoice.id;

  for v_line_json in select value from jsonb_array_elements(p_lines)
  loop
    v_line_type := trim(coalesce(v_line_json ->> 'lineType', ''));
    v_description := trim(coalesce(v_line_json ->> 'description', ''));
    v_detail := nullif(trim(coalesce(v_line_json ->> 'detail', '')), '');
    v_quantity := coalesce(nullif(v_line_json ->> 'quantity', '')::numeric, 1);
    v_unit := coalesce(nullif(trim(v_line_json ->> 'unit'), ''), 'each');
    v_unit_rate := coalesce(nullif(v_line_json ->> 'unitRate', '')::numeric, 0);
    v_amount := case
      when v_line_json ? 'amount' then coalesce((v_line_json ->> 'amount')::numeric, 0)
      else round(v_quantity * v_unit_rate, 2)
    end;
    v_position := coalesce(nullif(v_line_json ->> 'position', '')::integer, v_position);

    if v_line_type not in ('fixed_scope', 'labor', 'material', 'fee', 'change_order', 'other') then
      raise exception 'Unsupported invoice line type.';
    end if;

    if length(v_description) = 0 or length(v_description) > 500 then
      raise exception 'Invoice line descriptions must be between 1 and 500 characters.';
    end if;

    if v_quantity < 0 or v_unit_rate < 0 then
      raise exception 'Invoice line quantities and rates cannot be negative.';
    end if;

    insert into public.invoice_lines (
      invoice_id,
      business_id,
      owner_id,
      job_id,
      line_type,
      description,
      detail,
      quantity,
      unit,
      unit_rate,
      amount,
      position,
      metadata
    )
    values (
      v_invoice.id,
      v_invoice.business_id,
      v_invoice.owner_id,
      v_invoice.job_id,
      v_line_type,
      v_description,
      v_detail,
      v_quantity,
      v_unit,
      v_unit_rate,
      v_amount,
      v_position,
      coalesce(v_line_json -> 'metadata', '{}'::jsonb)
    )
    returning * into v_line;

    for v_source_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_line_json -> 'timeEntryIds', '[]'::jsonb))
    loop
      select *
      into v_time_entry
      from public.time_entries
      where id = v_source_id
      for share;

      if v_time_entry.id is null
        or v_time_entry.job_id <> v_invoice.job_id
        or v_time_entry.business_id <> v_invoice.business_id
      then
        raise exception 'An invoice labor entry does not belong to this job.';
      end if;

      if v_time_entry.status <> 'reviewed' then
        raise exception 'Only reviewed labor can be invoiced.';
      end if;

      if v_time_entry.invoice_id is not null and v_time_entry.invoice_id <> v_invoice.id then
        raise exception 'A labor entry on this draft has already been invoiced.';
      end if;

      insert into public.invoice_time_entries (
        invoice_id,
        invoice_line_id,
        time_entry_id,
        business_id,
        owner_id,
        job_id,
        source_amount,
        source_snapshot
      )
      values (
        v_invoice.id,
        v_line.id,
        v_time_entry.id,
        v_invoice.business_id,
        v_invoice.owner_id,
        v_invoice.job_id,
        round((v_time_entry.duration_minutes::numeric / 60) * v_time_entry.hourly_rate, 2),
        jsonb_build_object(
          'workDate', v_time_entry.work_date,
          'durationMinutes', v_time_entry.duration_minutes,
          'hourlyRate', v_time_entry.hourly_rate,
          'workerName', v_time_entry.worker_name,
          'description', v_time_entry.description
        )
      );
    end loop;

    for v_source_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_line_json -> 'expenseIds', '[]'::jsonb))
    loop
      select *
      into v_expense
      from public.expenses
      where id = v_source_id
      for share;

      if v_expense.id is null
        or v_expense.job_id <> v_invoice.job_id
        or v_expense.business_id <> v_invoice.business_id
      then
        raise exception 'An invoice expense does not belong to this job.';
      end if;

      if not v_expense.billable or v_expense.status not in ('reviewed', 'billable') then
        raise exception 'Only reviewed billable expenses can be invoiced.';
      end if;

      if v_expense.invoice_id is not null and v_expense.invoice_id <> v_invoice.id then
        raise exception 'An expense on this draft has already been invoiced.';
      end if;

      insert into public.invoice_expenses (
        invoice_id,
        invoice_line_id,
        expense_id,
        business_id,
        owner_id,
        job_id,
        source_amount,
        source_status,
        source_snapshot
      )
      values (
        v_invoice.id,
        v_line.id,
        v_expense.id,
        v_invoice.business_id,
        v_invoice.owner_id,
        v_invoice.job_id,
        v_expense.total_amount,
        v_expense.status,
        jsonb_build_object(
          'expenseDate', v_expense.expense_date,
          'expenseType', v_expense.expense_type,
          'description', v_expense.description,
          'preTaxAmount', v_expense.pre_tax_amount,
          'taxAmount', v_expense.tax_amount,
          'totalAmount', v_expense.total_amount,
          'receiptId', v_expense.receipt_id
        )
      );
    end loop;

    v_subtotal := v_subtotal + v_amount;
    v_position := v_position + 1;
  end loop;

  if v_retainage > greatest(v_subtotal, 0) then
    raise exception 'Retainage cannot exceed the invoice subtotal.';
  end if;

  update public.invoices
  set
    issue_date = coalesce(p_issue_date, issue_date),
    due_date = p_due_date,
    billing_period_start = p_billing_period_start,
    billing_period_end = p_billing_period_end,
    note = nullif(trim(coalesce(p_note, '')), ''),
    terms = nullif(trim(coalesce(p_terms, '')), ''),
    material_markup_percent = v_markup,
    retainage_amount = v_retainage,
    subtotal = round(v_subtotal, 2),
    balance_due = round(v_subtotal - v_retainage - amount_paid, 2),
    version = version + 1,
    last_mutation_key = trim(p_idempotency_key),
    updated_at = clock_timestamp()
  where id = v_invoice.id
  returning * into v_invoice;

  insert into public.invoice_events (
    invoice_id,
    business_id,
    owner_id,
    job_id,
    actor_user_id,
    event_type,
    idempotency_key,
    invoice_number_snapshot,
    invoice_version,
    metadata
  )
  values (
    v_invoice.id,
    v_invoice.business_id,
    v_invoice.owner_id,
    v_invoice.job_id,
    v_actor,
    'invoice_draft_saved',
    trim(p_idempotency_key),
    v_invoice.invoice_number,
    v_invoice.version,
    jsonb_build_object(
      'lineCount', jsonb_array_length(p_lines),
      'subtotal', v_invoice.subtotal,
      'balanceDue', v_invoice.balance_due
    )
  );

  return public.get_invoice_bundle(v_invoice.id);
end;
$$;

revoke all on function public.save_invoice_draft(
  uuid,
  integer,
  date,
  date,
  date,
  date,
  text,
  text,
  numeric,
  numeric,
  jsonb,
  text
) from public;
grant execute on function public.save_invoice_draft(
  uuid,
  integer,
  date,
  date,
  date,
  date,
  text,
  text,
  numeric,
  numeric,
  jsonb,
  text
) to authenticated;

create or replace function public.finalize_invoice(
  p_invoice_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_event public.invoice_events;
  v_invoice public.invoices;
  v_expected_count integer;
  v_fixed_scope_billed numeric;
  v_updated_count integer;
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'An idempotency key is required.';
  end if;

  select *
  into v_existing_event
  from public.invoice_events
  where actor_user_id = v_actor
    and idempotency_key = trim(p_idempotency_key);

  if v_existing_event.id is not null then
    if v_existing_event.invoice_id <> p_invoice_id
      or v_existing_event.event_type <> 'invoice_finalized'
    then
      raise exception 'That invoice request key was already used.';
    end if;
    return public.get_invoice_bundle(p_invoice_id);
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.user_can_manage_business(v_invoice.business_id) then
    raise exception 'Only a business owner or admin can finalize invoices.';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'Only draft invoices can be finalized.';
  end if;

  if p_expected_version is not null and v_invoice.version <> p_expected_version then
    raise exception 'This invoice changed after you opened it. Refresh and try again.';
  end if;

  if not exists (select 1 from public.invoice_lines where invoice_id = v_invoice.id) then
    raise exception 'Add at least one invoice line before finalizing.';
  end if;

  if v_invoice.billing_model = 'time_and_materials'
    and not exists (
      select 1 from public.invoice_time_entries where invoice_id = v_invoice.id
      union all
      select 1 from public.invoice_expenses where invoice_id = v_invoice.id
    )
  then
    raise exception 'A time and materials invoice must include unbilled labor or expenses.';
  end if;

  if v_invoice.billing_model = 'fixed_bid' and v_invoice.contract_amount > 0 then
    select coalesce(sum(il.amount), 0)
    into v_fixed_scope_billed
    from public.invoice_lines il
    join public.invoices i on i.id = il.invoice_id
    where i.job_id = v_invoice.job_id
      and il.line_type = 'fixed_scope'
      and (i.status = 'finalized' or i.id = v_invoice.id);

    if v_fixed_scope_billed > v_invoice.contract_amount then
      raise exception 'Fixed-scope billing cannot exceed the contract amount. Use a change order for added scope.';
    end if;
  end if;

  select count(*) into v_expected_count
  from public.invoice_time_entries
  where invoice_id = v_invoice.id;

  update public.time_entries t
  set
    invoice_id = v_invoice.id,
    invoiced_at = clock_timestamp(),
    updated_at = clock_timestamp()
  from public.invoice_time_entries ite
  where ite.invoice_id = v_invoice.id
    and ite.time_entry_id = t.id
    and t.invoice_id is null;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_expected_count then
    raise exception 'One or more labor entries were invoiced by another draft. Refresh and try again.';
  end if;

  select count(*) into v_expected_count
  from public.invoice_expenses
  where invoice_id = v_invoice.id;

  update public.expenses e
  set
    invoice_id = v_invoice.id,
    invoiced_at = clock_timestamp(),
    status = 'invoiced',
    updated_at = clock_timestamp()
  from public.invoice_expenses ie
  where ie.invoice_id = v_invoice.id
    and ie.expense_id = e.id
    and e.invoice_id is null;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_expected_count then
    raise exception 'One or more expenses were invoiced by another draft. Refresh and try again.';
  end if;

  update public.invoices
  set
    status = 'finalized',
    finalized_by_user_id = v_actor,
    finalized_at = clock_timestamp(),
    version = version + 1,
    last_mutation_key = trim(p_idempotency_key),
    updated_at = clock_timestamp()
  where id = v_invoice.id
  returning * into v_invoice;

  insert into public.invoice_events (
    invoice_id,
    business_id,
    owner_id,
    job_id,
    actor_user_id,
    event_type,
    idempotency_key,
    invoice_number_snapshot,
    invoice_version,
    metadata
  )
  values (
    v_invoice.id,
    v_invoice.business_id,
    v_invoice.owner_id,
    v_invoice.job_id,
    v_actor,
    'invoice_finalized',
    trim(p_idempotency_key),
    v_invoice.invoice_number,
    v_invoice.version,
    jsonb_build_object(
      'subtotal', v_invoice.subtotal,
      'retainageAmount', v_invoice.retainage_amount,
      'balanceDue', v_invoice.balance_due
    )
  );

  perform public.upsert_activity_event(
    v_invoice.business_id,
    v_invoice.owner_id,
    v_actor,
    v_actor,
    v_invoice.job_id,
    'invoice_finalized',
    'completed',
    'normal',
    'invoices',
    v_invoice.id,
    'Invoice finalized',
    v_invoice.invoice_number || ' - ' || to_char(v_invoice.balance_due, 'FM$999,999,990.00'),
    jsonb_build_object(
      'invoiceId', v_invoice.id,
      'invoiceNumber', v_invoice.invoice_number,
      'billingModel', v_invoice.billing_model,
      'balanceDue', v_invoice.balance_due
    ),
    v_invoice.finalized_at
  );

  return public.get_invoice_bundle(v_invoice.id);
end;
$$;

revoke all on function public.finalize_invoice(uuid, integer, text) from public;
grant execute on function public.finalize_invoice(uuid, integer, text) to authenticated;

revoke all on function public.guard_invoice_source_attribution() from public, authenticated;
