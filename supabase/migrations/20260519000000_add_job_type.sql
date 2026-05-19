alter table public.jobs
add column if not exists job_type text not null default 'fixed_bid';

alter table public.jobs
drop constraint if exists jobs_job_type_check;

alter table public.jobs
add constraint jobs_job_type_check
check (job_type in ('fixed_bid', 'time_and_materials'));
