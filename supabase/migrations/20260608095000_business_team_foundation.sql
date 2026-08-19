create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint businesses_name_check check (length(trim(name)) > 0)
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint business_members_role_check check (role in ('owner', 'admin', 'crew')),
  constraint business_members_status_check check (status in ('active', 'invited', 'disabled')),
  constraint business_members_unique_user unique (business_id, user_id)
);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.business_members to authenticated;

insert into public.businesses (owner_id, name)
select
  p.id,
  coalesce(nullif(trim(p.company_name), ''), nullif(trim(p.full_name), ''), 'My Business')
from public.profiles p
where not exists (
  select 1
  from public.businesses b
  where b.owner_id = p.id
);

insert into public.business_members (business_id, user_id, role, status)
select
  b.id,
  b.owner_id,
  'owner',
  'active'
from public.businesses b
where not exists (
  select 1
  from public.business_members bm
  where bm.business_id = b.id
    and bm.user_id = b.owner_id
);

create or replace function public.user_is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

create or replace function public.user_can_manage_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.role in ('owner', 'admin')
  );
$$;

create or replace function public.default_business_for_user(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.businesses b
  where b.owner_id = p_user_id
  order by b.created_at asc
  limit 1;
$$;

drop policy if exists "Business members can read their businesses" on public.businesses;
drop policy if exists "Business owners can create businesses" on public.businesses;
drop policy if exists "Business admins can update businesses" on public.businesses;
drop policy if exists "Business owners can delete businesses" on public.businesses;

create policy "Business members can read their businesses"
on public.businesses
for select
to authenticated
using (public.user_is_business_member(id));

create policy "Business owners can create businesses"
on public.businesses
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Business admins can update businesses"
on public.businesses
for update
to authenticated
using (public.user_can_manage_business(id))
with check (public.user_can_manage_business(id));

create policy "Business owners can delete businesses"
on public.businesses
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Business members can read memberships" on public.business_members;
drop policy if exists "Business admins can create memberships" on public.business_members;
drop policy if exists "Business admins can update memberships" on public.business_members;
drop policy if exists "Business owners can delete memberships" on public.business_members;

create policy "Business members can read memberships"
on public.business_members
for select
to authenticated
using (public.user_is_business_member(business_id));

create policy "Business admins can create memberships"
on public.business_members
for insert
to authenticated
with check (public.user_can_manage_business(business_id));

create policy "Business admins can update memberships"
on public.business_members
for update
to authenticated
using (public.user_can_manage_business(business_id))
with check (public.user_can_manage_business(business_id));

create policy "Business owners can delete memberships"
on public.business_members
for delete
to authenticated
using (public.user_can_manage_business(business_id));

alter table public.contacts
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.jobs
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.job_crew_members
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.job_contacts
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.job_plans
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.receipts
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.receipt_line_items
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.expenses
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.time_entries
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.customer_payments
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.job_notes
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.attachments
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.job_activity
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null,
add column if not exists actor_user_id uuid references public.profiles(id) on delete set null;

alter table public.job_snapshots
add column if not exists business_id uuid references public.businesses(id) on delete cascade,
add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

update public.contacts t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.jobs t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.job_crew_members t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

update public.job_contacts t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

update public.job_plans t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

update public.receipts t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.scan_context_job_id = j.id
  and t.business_id is null;

update public.receipts t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.receipt_line_items t
set
  business_id = coalesce(r.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.receipts r
where t.receipt_id = r.id
  and t.business_id is null;

update public.expenses t
set business_id = j.business_id
from public.jobs j
where t.business_id is null
  and t.job_id = j.id;

update public.expenses t
set business_id = r.business_id
from public.receipts r
where t.business_id is null
  and t.receipt_id = r.id;

update public.expenses t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.expenses t
set created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.created_by_user_id is null;

update public.time_entries t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

update public.time_entries t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.customer_payments t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

update public.customer_payments t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.job_notes t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

update public.job_notes t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.attachments t
set business_id = j.business_id
from public.jobs j
where t.business_id is null
  and t.job_id = j.id;

update public.attachments t
set business_id = n.business_id
from public.job_notes n
where t.business_id is null
  and t.note_id = n.id;

update public.attachments t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.business_id is null;

update public.attachments t
set created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
where t.created_by_user_id is null;

update public.job_activity t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id),
  actor_user_id = coalesce(t.actor_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

update public.job_activity t
set
  business_id = public.default_business_for_user(t.owner_id),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id),
  actor_user_id = coalesce(t.actor_user_id, t.owner_id)
where t.business_id is null;

update public.job_snapshots t
set
  business_id = coalesce(j.business_id, public.default_business_for_user(t.owner_id)),
  created_by_user_id = coalesce(t.created_by_user_id, t.owner_id)
from public.jobs j
where t.job_id = j.id
  and t.business_id is null;

alter table public.contacts alter column business_id set not null;
alter table public.jobs alter column business_id set not null;
alter table public.job_crew_members alter column business_id set not null;
alter table public.job_contacts alter column business_id set not null;
alter table public.job_plans alter column business_id set not null;
alter table public.receipts alter column business_id set not null;
alter table public.receipt_line_items alter column business_id set not null;
alter table public.expenses alter column business_id set not null;
alter table public.time_entries alter column business_id set not null;
alter table public.customer_payments alter column business_id set not null;
alter table public.job_notes alter column business_id set not null;
alter table public.attachments alter column business_id set not null;
alter table public.job_activity alter column business_id set not null;
alter table public.job_snapshots alter column business_id set not null;

create or replace function public.set_business_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is null then
    new.business_id := public.default_business_for_user(new.owner_id);
  end if;

  if new.created_by_user_id is null then
    new.created_by_user_id := coalesce(auth.uid(), new.owner_id);
  end if;

  return new;
end;
$$;

create or replace function public.set_business_activity_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is null then
    new.business_id := public.default_business_for_user(new.owner_id);
  end if;

  if new.created_by_user_id is null then
    new.created_by_user_id := coalesce(auth.uid(), new.owner_id);
  end if;

  if new.actor_user_id is null then
    new.actor_user_id := coalesce(auth.uid(), new.owner_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_contacts_business_owner_columns on public.contacts;
create trigger set_contacts_business_owner_columns
before insert on public.contacts
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_jobs_business_owner_columns on public.jobs;
create trigger set_jobs_business_owner_columns
before insert on public.jobs
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_job_crew_members_business_owner_columns on public.job_crew_members;
create trigger set_job_crew_members_business_owner_columns
before insert on public.job_crew_members
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_job_contacts_business_owner_columns on public.job_contacts;
create trigger set_job_contacts_business_owner_columns
before insert on public.job_contacts
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_job_plans_business_owner_columns on public.job_plans;
create trigger set_job_plans_business_owner_columns
before insert on public.job_plans
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_receipts_business_owner_columns on public.receipts;
create trigger set_receipts_business_owner_columns
before insert on public.receipts
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_receipt_line_items_business_owner_columns on public.receipt_line_items;
create trigger set_receipt_line_items_business_owner_columns
before insert on public.receipt_line_items
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_expenses_business_owner_columns on public.expenses;
create trigger set_expenses_business_owner_columns
before insert on public.expenses
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_time_entries_business_owner_columns on public.time_entries;
create trigger set_time_entries_business_owner_columns
before insert on public.time_entries
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_customer_payments_business_owner_columns on public.customer_payments;
create trigger set_customer_payments_business_owner_columns
before insert on public.customer_payments
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_job_notes_business_owner_columns on public.job_notes;
create trigger set_job_notes_business_owner_columns
before insert on public.job_notes
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_attachments_business_owner_columns on public.attachments;
create trigger set_attachments_business_owner_columns
before insert on public.attachments
for each row execute function public.set_business_owner_columns();

drop trigger if exists set_job_activity_business_owner_columns on public.job_activity;
create trigger set_job_activity_business_owner_columns
before insert on public.job_activity
for each row execute function public.set_business_activity_owner_columns();

drop trigger if exists set_job_snapshots_business_owner_columns on public.job_snapshots;
create trigger set_job_snapshots_business_owner_columns
before insert on public.job_snapshots
for each row execute function public.set_business_owner_columns();

create index if not exists contacts_business_idx on public.contacts (business_id, lower(display_name));
create index if not exists jobs_business_status_idx on public.jobs (business_id, status);
create index if not exists job_crew_members_business_idx on public.job_crew_members (business_id, job_id, active);
create index if not exists job_contacts_business_idx on public.job_contacts (business_id, job_id);
create index if not exists job_plans_business_idx on public.job_plans (business_id, job_id);
create index if not exists receipts_business_created_idx on public.receipts (business_id, created_at desc);
create index if not exists receipt_line_items_business_idx on public.receipt_line_items (business_id, receipt_id);
create index if not exists expenses_business_date_idx on public.expenses (business_id, expense_date desc);
create index if not exists time_entries_business_date_idx on public.time_entries (business_id, work_date desc);
create index if not exists customer_payments_business_date_idx on public.customer_payments (business_id, payment_date desc);
create index if not exists job_notes_business_created_idx on public.job_notes (business_id, created_at desc);
create index if not exists attachments_business_created_idx on public.attachments (business_id, created_at desc);
create index if not exists job_activity_business_occurred_idx on public.job_activity (business_id, occurred_at desc);
create index if not exists job_snapshots_business_idx on public.job_snapshots (business_id, job_id);

drop policy if exists "Business members can read contacts" on public.contacts;
create policy "Business members can read contacts"
on public.contacts
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read jobs" on public.jobs;
create policy "Business members can read jobs"
on public.jobs
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read job crew members" on public.job_crew_members;
create policy "Business members can read job crew members"
on public.job_crew_members
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read job contacts" on public.job_contacts;
create policy "Business members can read job contacts"
on public.job_contacts
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read job plans" on public.job_plans;
create policy "Business members can read job plans"
on public.job_plans
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read receipts" on public.receipts;
create policy "Business members can read receipts"
on public.receipts
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read receipt line items" on public.receipt_line_items;
create policy "Business members can read receipt line items"
on public.receipt_line_items
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read expenses" on public.expenses;
create policy "Business members can read expenses"
on public.expenses
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read time entries" on public.time_entries;
create policy "Business members can read time entries"
on public.time_entries
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read customer payments" on public.customer_payments;
create policy "Business members can read customer payments"
on public.customer_payments
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read job notes" on public.job_notes;
create policy "Business members can read job notes"
on public.job_notes
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read attachments" on public.attachments;
create policy "Business members can read attachments"
on public.attachments
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read job activity" on public.job_activity;
create policy "Business members can read job activity"
on public.job_activity
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read job snapshots" on public.job_snapshots;
create policy "Business members can read job snapshots"
on public.job_snapshots
for select
to authenticated
using (public.user_is_business_member(business_id));

create or replace view public.job_financial_snapshots
with (security_invoker = true)
as
with labor_by_job as (
  select
    job_id,
    owner_id,
    business_id,
    coalesce(sum((duration_minutes::numeric / 60) * hourly_rate), 0) as labor_cost,
    coalesce(sum(duration_minutes::numeric / 60), 0) as total_hours
  from public.time_entries
  where job_id is not null
    and status = 'reviewed'
  group by job_id, owner_id, business_id
),
payments_by_job as (
  select
    job_id,
    owner_id,
    business_id,
    coalesce(sum(amount), 0) as payments_received
  from public.customer_payments
  where job_id is not null
  group by job_id, owner_id, business_id
),
expenses_by_job as (
  select
    job_id,
    owner_id,
    business_id,
    coalesce(sum(total_amount), 0) as receipt_cost
  from public.expenses
  where job_id is not null
    and status in ('reviewed', 'billable', 'invoiced')
  group by job_id, owner_id, business_id
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
  coalesce(l.total_hours, 0) as total_hours,
  j.business_id
from public.jobs j
left join labor_by_job l on l.job_id = j.id and l.business_id = j.business_id
left join payments_by_job p on p.job_id = j.id and p.business_id = j.business_id
left join expenses_by_job e on e.job_id = j.id and e.business_id = j.business_id;

grant select on public.job_financial_snapshots to authenticated;

create or replace view public.tools_inventory_expenses
with (security_invoker = true)
as
select
  e.id,
  e.owner_id,
  e.receipt_id,
  e.receipt_line_item_id,
  e.description,
  e.expense_date,
  e.expense_type,
  e.source_type,
  e.pre_tax_amount,
  e.tax_amount,
  e.total_amount,
  e.billable,
  e.status,
  e.notes,
  e.created_at,
  e.updated_at,
  r.vendor as receipt_vendor,
  r.receipt_date,
  r.storage_path as receipt_storage_path,
  e.business_id
from public.expenses e
left join public.receipts r on r.id = e.receipt_id and r.business_id = e.business_id
where e.job_id is null
  and e.expense_type in ('tool', 'inventory')
  and e.status <> 'ignored';

grant select on public.tools_inventory_expenses to authenticated;
