-- The first two historical migrations predate the repository's full schema
-- reset and assume profiles/jobs already exist. Keep this small compatibility
-- bootstrap so a brand-new Supabase project can replay the complete history.
-- The jobs table is replaced by 20260518002000_v2_schema_reset.sql.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  default_hourly_rate numeric,
  created_at timestamptz default now(),
  constraint profiles_default_hourly_rate_check
    check (default_hourly_rate is null or default_hourly_rate >= 0)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null
);
