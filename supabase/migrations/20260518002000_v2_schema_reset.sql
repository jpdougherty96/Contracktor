drop view if exists public.job_financial_snapshots;

drop table if exists public.job_activity cascade;
drop table if exists public.job_events cascade;
drop table if exists public.job_summaries cascade;
drop table if exists public.job_snapshots cascade;
drop table if exists public.expenses cascade;
drop table if exists public.receipt_line_items cascade;
drop table if exists public.receipts cascade;
drop table if exists public.attachments cascade;
drop table if exists public.customer_payments cascade;
drop table if exists public.payments cascade;
drop table if exists public.job_time_entries cascade;
drop table if exists public.job_hours cascade;
drop table if exists public.time_entries cascade;
drop table if exists public.job_notes cascade;
drop table if exists public.job_plans cascade;
drop table if exists public.job_contacts cascade;
drop table if exists public.contacts cascade;
drop table if exists public.jobs cascade;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  default_hourly_rate numeric,
  created_at timestamptz default now(),
  constraint profiles_default_hourly_rate_check
    check (default_hourly_rate is null or default_hourly_rate >= 0)
);

alter table public.profiles enable row level security;

grant select, insert, update
on public.profiles
to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  company_name text,
  email text,
  phone text,
  contact_type text not null default 'client',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint contacts_contact_type_check
    check (contact_type in ('client', 'homeowner', 'subcontractor', 'vendor', 'architect', 'other'))
);

alter table public.contacts enable row level security;

create policy "Users can manage their own contacts"
on public.contacts
for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

grant select, insert, update, delete
on public.contacts
to authenticated;

create unique index contacts_owner_display_name_idx
on public.contacts (owner_id, lower(display_name));

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  client_name text,
  location text,
  job_type text not null default 'fixed_bid',
  quote_amount numeric not null default 0,
  hourly_rate numeric,
  time_clock_enabled boolean not null default false,
  estimated_labor_hours numeric,
  estimated_material_cost numeric,
  estimated_sub_cost numeric,
  estimated_misc_cost numeric,
  status text not null default 'active',
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint jobs_status_check
    check (status in ('active', 'paused', 'completed', 'closed', 'archived')),
  constraint jobs_job_type_check
    check (job_type in ('fixed_bid', 'time_and_materials')),
  constraint jobs_amounts_nonnegative_check
    check (
      quote_amount >= 0
      and (hourly_rate is null or hourly_rate >= 0)
      and (estimated_labor_hours is null or estimated_labor_hours >= 0)
      and (estimated_material_cost is null or estimated_material_cost >= 0)
      and (estimated_sub_cost is null or estimated_sub_cost >= 0)
      and (estimated_misc_cost is null or estimated_misc_cost >= 0)
    )
);

alter table public.jobs enable row level security;

create policy "Users can manage their own jobs"
on public.jobs
for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

grant select, insert, update, delete
on public.jobs
to authenticated;

create index jobs_owner_status_idx on public.jobs (owner_id, status);

create table public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'client',
  is_primary boolean not null default false,
  created_at timestamptz default now(),
  constraint job_contacts_role_check
    check (role in ('client', 'homeowner', 'subcontractor', 'vendor', 'architect', 'other')),
  constraint job_contacts_unique_job_contact_role unique (job_id, contact_id, role)
);

alter table public.job_contacts enable row level security;

create policy "Users can read their own job contacts"
on public.job_contacts
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job contacts"
on public.job_contacts
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.owner_id = auth.uid()
  )
  and exists (
    select 1 from public.contacts c
    where c.id = contact_id and c.owner_id = auth.uid()
  )
);

create policy "Users can update valid job contacts"
on public.job_contacts
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.owner_id = auth.uid()
  )
  and exists (
    select 1 from public.contacts c
    where c.id = contact_id and c.owner_id = auth.uid()
  )
);

create policy "Users can delete their own job contacts"
on public.job_contacts
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.job_contacts
to authenticated;

create table public.job_plans (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  scope_of_work text,
  assumptions text,
  exclusions text,
  estimated_labor_hours numeric,
  estimated_material_cost numeric,
  estimated_other_cost numeric,
  planned_phases text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint job_plans_estimates_nonnegative_check
    check (
      (estimated_labor_hours is null or estimated_labor_hours >= 0)
      and (estimated_material_cost is null or estimated_material_cost >= 0)
      and (estimated_other_cost is null or estimated_other_cost >= 0)
    )
);

alter table public.job_plans enable row level security;

create policy "Users can read their own job plans"
on public.job_plans
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job plans"
on public.job_plans
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.owner_id = auth.uid()
  )
);

create policy "Users can update valid job plans"
on public.job_plans
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.owner_id = auth.uid()
  )
);

create policy "Users can delete their own job plans"
on public.job_plans
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.job_plans
to authenticated;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  scan_context_job_id uuid references public.jobs(id) on delete set null,
  storage_path text,
  original_filename text,
  vendor text,
  receipt_date date,
  subtotal numeric,
  tax numeric,
  total numeric,
  category text,
  ai_confidence numeric,
  extracted_json jsonb,
  status text not null default 'processing',
  review_status text not null default 'needs_review',
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint receipts_status_check
    check (status in ('processing', 'needs_review', 'accepted', 'error')),
  constraint receipts_review_status_check
    check (review_status in ('processing', 'needs_review', 'reviewed', 'error')),
  constraint receipts_amounts_nonnegative_check
    check (
      (subtotal is null or subtotal >= 0)
      and (tax is null or tax >= 0)
      and (total is null or total >= 0)
      and (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1))
    )
);

alter table public.receipts enable row level security;

create policy "Users can read their own receipts"
on public.receipts
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid receipts"
on public.receipts
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    scan_context_job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = scan_context_job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid receipts"
on public.receipts
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    scan_context_job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = scan_context_job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own receipts"
on public.receipts
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.receipts
to authenticated;

create index receipts_owner_created_idx on public.receipts (owner_id, created_at desc);
create index receipts_scan_context_job_id_idx on public.receipts (scan_context_job_id);
create index receipts_duplicate_lookup_idx
on public.receipts (owner_id, receipt_date, total)
where total is not null;

create table public.receipt_line_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  assigned_job_id uuid references public.jobs(id) on delete set null,
  line_number integer not null,
  original_text text,
  cleaned_name text not null,
  quantity numeric,
  unit_price numeric,
  line_total numeric not null default 0,
  line_type text not null default 'item',
  category text,
  assignment_type text not null default 'job',
  review_status text not null default 'needs_review',
  confidence numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint receipt_line_items_line_type_check
    check (line_type in ('item', 'tax', 'fee', 'discount')),
  constraint receipt_line_items_assignment_type_check
    check (assignment_type in ('job', 'tools_inventory', 'ignore')),
  constraint receipt_line_items_review_status_check
    check (review_status in ('needs_review', 'confirmed', 'ignored')),
  constraint receipt_line_items_amounts_check
    check (
      (quantity is null or quantity >= 0)
      and (unit_price is null or unit_price >= 0)
      and line_total >= 0
      and (confidence is null or (confidence >= 0 and confidence <= 1))
    ),
  constraint receipt_line_items_assigned_job_check
    check (
      (assignment_type = 'job' and assigned_job_id is not null)
      or (assignment_type <> 'job' and assigned_job_id is null)
    )
);

alter table public.receipt_line_items enable row level security;

create policy "Users can read their own receipt line items"
on public.receipt_line_items
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid receipt line items"
on public.receipt_line_items
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.receipts r
    where r.id = receipt_id and r.owner_id = auth.uid()
  )
  and (
    assigned_job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = assigned_job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid receipt line items"
on public.receipt_line_items
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.receipts r
    where r.id = receipt_id and r.owner_id = auth.uid()
  )
  and (
    assigned_job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = assigned_job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own receipt line items"
on public.receipt_line_items
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.receipt_line_items
to authenticated;

create index receipt_line_items_receipt_id_idx on public.receipt_line_items (receipt_id);
create index receipt_line_items_assigned_job_id_idx
on public.receipt_line_items (assigned_job_id)
where assignment_type = 'job';

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  receipt_id uuid references public.receipts(id) on delete set null,
  receipt_line_item_id uuid references public.receipt_line_items(id) on delete set null,
  description text not null,
  expense_date date not null default current_date,
  expense_type text not null default 'other',
  source_type text not null default 'manual',
  pre_tax_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  billable boolean not null default false,
  status text not null default 'reviewed',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint expenses_expense_type_check
    check (expense_type in ('material', 'tool', 'inventory', 'rental', 'mileage', 'permit', 'subcontractor', 'fuel', 'other')),
  constraint expenses_source_type_check
    check (source_type in ('manual', 'receipt', 'receipt_line_item', 'email', 'mileage', 'import')),
  constraint expenses_status_check
    check (status in ('draft', 'reviewed', 'billable', 'invoiced', 'ignored')),
  constraint expenses_amounts_nonnegative_check
    check (pre_tax_amount >= 0 and tax_amount >= 0 and total_amount >= 0)
);

alter table public.expenses enable row level security;

create policy "Users can read their own expenses"
on public.expenses
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid expenses"
on public.expenses
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
  and (
    receipt_id is null
    or exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.owner_id = auth.uid()
    )
  )
  and (
    receipt_line_item_id is null
    or exists (
      select 1 from public.receipt_line_items li
      where li.id = receipt_line_item_id and li.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid expenses"
on public.expenses
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
  and (
    receipt_id is null
    or exists (
      select 1 from public.receipts r
      where r.id = receipt_id and r.owner_id = auth.uid()
    )
  )
  and (
    receipt_line_item_id is null
    or exists (
      select 1 from public.receipt_line_items li
      where li.id = receipt_line_item_id and li.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own expenses"
on public.expenses
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.expenses
to authenticated;

create index expenses_job_id_idx on public.expenses (job_id);
create index expenses_receipt_id_idx on public.expenses (receipt_id);
create index expenses_owner_date_idx on public.expenses (owner_id, expense_date desc);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  started_at timestamptz,
  stopped_at timestamptz,
  work_date date not null default current_date,
  duration_minutes integer not null default 0,
  hourly_rate numeric not null default 0,
  worker_name text,
  description text,
  billable boolean not null default false,
  source text not null default 'manual',
  status text not null default 'reviewed',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint time_entries_source_check
    check (source in ('manual', 'timer', 'calendar', 'geo', 'zoom', 'phone')),
  constraint time_entries_status_check
    check (status in ('draft', 'active', 'reviewed', 'ignored')),
  constraint time_entries_amounts_check
    check (duration_minutes >= 0 and hourly_rate >= 0)
);

alter table public.time_entries enable row level security;

create policy "Users can read their own time entries"
on public.time_entries
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid time entries"
on public.time_entries
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid time entries"
on public.time_entries
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own time entries"
on public.time_entries
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.time_entries
to authenticated;

create unique index time_entries_one_active_per_owner
on public.time_entries (owner_id)
where status = 'active';

create index time_entries_job_date_idx on public.time_entries (job_id, work_date desc);

create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  amount numeric not null,
  payment_date date not null,
  method text,
  source text not null default 'manual',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint customer_payments_amount_positive_check
    check (amount > 0)
);

alter table public.customer_payments enable row level security;

create policy "Users can read their own customer payments"
on public.customer_payments
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid customer payments"
on public.customer_payments
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid customer payments"
on public.customer_payments
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own customer payments"
on public.customer_payments
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.customer_payments
to authenticated;

create index customer_payments_job_date_idx on public.customer_payments (job_id, payment_date desc);

create table public.job_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  note text not null,
  note_type text not null default 'general',
  created_at timestamptz default now()
);

alter table public.job_notes enable row level security;

create policy "Users can read their own job notes"
on public.job_notes
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job notes"
on public.job_notes
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid job notes"
on public.job_notes
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own job notes"
on public.job_notes
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.job_notes
to authenticated;

create index job_notes_job_created_idx on public.job_notes (job_id, created_at desc);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  note_id uuid references public.job_notes(id) on delete cascade,
  storage_path text not null,
  original_filename text,
  file_type text,
  description text,
  created_at timestamptz default now()
);

alter table public.attachments enable row level security;

create policy "Users can read their own attachments"
on public.attachments
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid attachments"
on public.attachments
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
  and (
    note_id is null
    or exists (
      select 1 from public.job_notes n
      where n.id = note_id and n.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid attachments"
on public.attachments
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
  and (
    note_id is null
    or exists (
      select 1 from public.job_notes n
      where n.id = note_id and n.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own attachments"
on public.attachments
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.attachments
to authenticated;

create index attachments_note_id_idx on public.attachments (note_id);

create table public.job_activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  activity_type text not null,
  source_table text,
  source_id uuid,
  title text not null,
  detail text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now(),
  constraint job_activity_type_check
    check (activity_type in ('receipt', 'expense', 'time', 'note', 'payment', 'photo', 'job', 'snapshot'))
);

alter table public.job_activity enable row level security;

create policy "Users can read their own job activity"
on public.job_activity
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job activity"
on public.job_activity
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can update valid job activity"
on public.job_activity
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.owner_id = auth.uid()
    )
  )
);

create policy "Users can delete their own job activity"
on public.job_activity
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.job_activity
to authenticated;

create index job_activity_job_occurred_idx on public.job_activity (job_id, occurred_at desc);

create table public.job_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  scope_summary text,
  financial_summary text,
  risk_summary text,
  next_actions text,
  open_questions text,
  snapshot_json jsonb,
  generated_by text,
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.job_snapshots enable row level security;

create policy "Users can read their own job snapshots"
on public.job_snapshots
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job snapshots"
on public.job_snapshots
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.owner_id = auth.uid()
  )
);

create policy "Users can update valid job snapshots"
on public.job_snapshots
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.owner_id = auth.uid()
  )
);

create policy "Users can delete their own job snapshots"
on public.job_snapshots
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.job_snapshots
to authenticated;

create or replace view public.job_financial_snapshots
with (security_invoker = true)
as
with labor_by_job as (
  select
    job_id,
    owner_id,
    coalesce(sum((duration_minutes::numeric / 60) * hourly_rate), 0) as labor_cost,
    coalesce(sum(duration_minutes::numeric / 60), 0) as total_hours
  from public.time_entries
  where job_id is not null
    and status = 'reviewed'
  group by job_id, owner_id
),
payments_by_job as (
  select
    job_id,
    owner_id,
    coalesce(sum(amount), 0) as payments_received
  from public.customer_payments
  where job_id is not null
  group by job_id, owner_id
),
expenses_by_job as (
  select
    job_id,
    owner_id,
    coalesce(sum(total_amount), 0) as receipt_cost
  from public.expenses
  where job_id is not null
    and status in ('reviewed', 'billable', 'invoiced')
  group by job_id, owner_id
)
select
  j.id as job_id,
  j.owner_id,
  j.name,
  j.client_name,
  j.quote_amount,
  coalesce(p.payments_received, 0) as payments_received,
  coalesce(l.labor_cost, 0) as labor_cost,
  coalesce(e.receipt_cost, 0) as receipt_cost,
  coalesce(l.labor_cost, 0) + coalesce(e.receipt_cost, 0) as total_cost,
  coalesce(j.quote_amount, 0) - (coalesce(l.labor_cost, 0) + coalesce(e.receipt_cost, 0)) as projected_profit,
  case
    when coalesce(j.quote_amount, 0) > 0 then
      (coalesce(j.quote_amount, 0) - (coalesce(l.labor_cost, 0) + coalesce(e.receipt_cost, 0))) / j.quote_amount * 100
    else 0
  end as projected_margin_percent,
  coalesce(l.total_hours, 0) as total_hours
from public.jobs j
left join labor_by_job l on l.job_id = j.id and l.owner_id = j.owner_id
left join payments_by_job p on p.job_id = j.id and p.owner_id = j.owner_id
left join expenses_by_job e on e.job_id = j.id and e.owner_id = j.owner_id;

grant select
on public.job_financial_snapshots
to authenticated;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can upload their own receipt photos" on storage.objects;
drop policy if exists "Users can read their own receipt photos" on storage.objects;
drop policy if exists "Users can update their own receipt photos" on storage.objects;
drop policy if exists "Users can delete their own receipt photos" on storage.objects;

create policy "Users can upload their own receipt photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read their own receipt photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own receipt photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own receipt photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can upload their own attachments" on storage.objects;
drop policy if exists "Users can read their own attachments" on storage.objects;
drop policy if exists "Users can update their own attachments" on storage.objects;
drop policy if exists "Users can delete their own attachments" on storage.objects;

create policy "Users can upload their own attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read their own attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
