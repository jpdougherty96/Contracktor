create table if not exists public.job_crew_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  hourly_rate numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint job_crew_members_name_check
    check (length(trim(name)) > 0),
  constraint job_crew_members_hourly_rate_check
    check (hourly_rate >= 0)
);

alter table public.job_crew_members enable row level security;

drop policy if exists "Users can read their own job crew members"
on public.job_crew_members;
create policy "Users can read their own job crew members"
on public.job_crew_members
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can create valid job crew members"
on public.job_crew_members;
create policy "Users can create valid job crew members"
on public.job_crew_members
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.owner_id = auth.uid()
  )
);

drop policy if exists "Users can update valid job crew members"
on public.job_crew_members;
create policy "Users can update valid job crew members"
on public.job_crew_members
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

drop policy if exists "Users can delete their own job crew members"
on public.job_crew_members;
create policy "Users can delete their own job crew members"
on public.job_crew_members
for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete
on public.job_crew_members
to authenticated;

create index if not exists job_crew_members_job_active_idx
on public.job_crew_members (job_id, active, name);
