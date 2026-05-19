alter table public.jobs
add column if not exists time_clock_enabled boolean not null default false;

create table if not exists public.job_time_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  duration_hours numeric,
  hourly_rate numeric not null,
  worker_name text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.job_time_entries enable row level security;

create policy "Users can read their own time entries"
on public.job_time_entries
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create their own time entries"
on public.job_time_entries
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Users can update their own time entries"
on public.job_time_entries
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create unique index if not exists job_time_entries_one_active_per_owner
on public.job_time_entries (owner_id)
where stopped_at is null;
