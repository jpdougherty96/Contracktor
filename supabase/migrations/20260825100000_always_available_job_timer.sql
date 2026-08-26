-- Every active job supports timer and manual labor entry. Keep the legacy
-- time_clock_enabled column temporarily so older clients remain compatible,
-- but coerce every write to the permanent product invariant.

alter table public.jobs
  alter column time_clock_enabled set default true;

update public.jobs
set time_clock_enabled = true
where time_clock_enabled = false;

create or replace function public.force_job_time_clock_available()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.time_clock_enabled := true;
  return new;
end;
$$;

drop trigger if exists force_job_time_clock_available on public.jobs;
create trigger force_job_time_clock_available
before insert or update of time_clock_enabled on public.jobs
for each row
execute function public.force_job_time_clock_available();

comment on column public.jobs.time_clock_enabled is
  'Deprecated compatibility column. Timers are available for every active job and writes are forced true.';

-- Preserve the existing atomic switch behavior and active-job validation,
-- while removing the obsolete per-job enablement gate.
create or replace function public.start_job_timer_atomic(
  p_job_id uuid,
  p_hourly_rate numeric,
  p_worker_name text default null
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_job public.jobs;
  v_active public.time_entries;
  v_started public.time_entries;
  v_now timestamptz := now();
  v_duration_minutes integer;
begin
  if v_auth_user is null then
    raise exception 'Authentication is required.';
  end if;

  if p_job_id is null then
    raise exception 'A job is required to start a timer.';
  end if;

  if p_hourly_rate is null or p_hourly_rate <= 0 then
    raise exception 'Set the hourly rate for this job before starting a timer.';
  end if;

  select *
  into v_job
  from public.jobs
  where id = p_job_id
  for share;

  if v_job.id is null or not public.user_is_business_member(v_job.business_id) then
    raise exception 'This job is not available.';
  end if;

  if v_job.status <> 'active' then
    raise exception 'Only active jobs can start a timer.';
  end if;

  select *
  into v_active
  from public.time_entries
  where owner_id = v_auth_user
    and status = 'active'
  for update;

  if v_active.id is not null and v_active.job_id = p_job_id then
    raise exception 'A timer is already running for this job.';
  end if;

  if v_active.id is not null then
    if v_active.started_at is null then
      raise exception 'The running timer is missing its start time.';
    end if;

    v_duration_minutes := greatest(
      0,
      round(extract(epoch from (v_now - v_active.started_at)) / 60)::integer
    );

    if v_duration_minutes = 0 then
      delete from public.time_entries where id = v_active.id;
    else
      update public.time_entries
      set
        duration_minutes = v_duration_minutes,
        stopped_at = v_now,
        status = 'reviewed',
        updated_at = v_now,
        work_date = v_now::date
      where id = v_active.id
      returning * into v_active;

      perform public.upsert_activity_event(
        v_active.business_id,
        v_active.owner_id,
        v_auth_user,
        v_active.created_by_user_id,
        v_active.job_id,
        'hours_logged',
        'completed',
        'normal',
        'time_entries',
        v_active.id,
        'Hours logged',
        trim(to_char(v_duration_minutes::numeric / 60, 'FM999999990.00')) || ' hrs'
          || case when nullif(trim(coalesce(v_active.worker_name, '')), '') is not null
            then ' - ' || trim(v_active.worker_name)
            else ''
          end
          || case when nullif(trim(coalesce(v_active.description, '')), '') is not null
            then ' - ' || trim(v_active.description)
            else ''
          end,
        jsonb_build_object(
          'durationMinutes', v_active.duration_minutes,
          'hourlyRate', v_active.hourly_rate,
          'source', v_active.source,
          'workDate', v_active.work_date,
          'workerName', v_active.worker_name
        ),
        v_now
      );
    end if;
  end if;

  insert into public.time_entries (
    business_id,
    created_by_user_id,
    hourly_rate,
    job_id,
    owner_id,
    source,
    started_at,
    status,
    work_date,
    worker_name
  )
  values (
    v_job.business_id,
    v_auth_user,
    p_hourly_rate,
    p_job_id,
    v_auth_user,
    'timer',
    v_now,
    'active',
    v_now::date,
    nullif(trim(coalesce(p_worker_name, '')), '')
  )
  returning * into v_started;

  return v_started;
end;
$$;

revoke all on function public.start_job_timer_atomic(uuid, numeric, text) from public;
grant execute on function public.start_job_timer_atomic(uuid, numeric, text) to authenticated;
