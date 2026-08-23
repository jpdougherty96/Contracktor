-- Job Tasks v1: manager-authored planned work with immutable task history.
-- Crew access intentionally waits for an authoritative user-to-job assignment model.

create table public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  status text not null default 'open',
  source_type text not null default 'manual',
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  cancelled_by_user_id uuid references public.profiles(id) on delete set null,
  creation_idempotency_key text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint job_tasks_title_check check (length(trim(title)) between 1 and 240),
  constraint job_tasks_status_check check (status in ('open', 'completed', 'cancelled')),
  constraint job_tasks_source_type_check check (source_type in ('manual', 'tell_contracktor')),
  constraint job_tasks_version_check check (version > 0),
  constraint job_tasks_creation_idempotency_unique
    unique (created_by_user_id, creation_idempotency_key)
);

create table public.job_task_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  task_id uuid not null references public.job_tasks(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  title_snapshot text not null,
  source_type text not null default 'manual',
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint job_task_events_type_check
    check (event_type in ('task_created', 'task_renamed', 'task_completed', 'task_reopened', 'task_cancelled')),
  constraint job_task_events_source_type_check check (source_type in ('manual', 'tell_contracktor')),
  constraint job_task_events_title_check check (length(trim(title_snapshot)) between 1 and 240),
  constraint job_task_events_idempotency_unique unique (actor_user_id, idempotency_key)
);

create index job_tasks_job_status_idx
on public.job_tasks (job_id, status, created_at);

create index job_task_events_job_occurred_idx
on public.job_task_events (job_id, occurred_at desc);

create index job_task_events_task_occurred_idx
on public.job_task_events (task_id, occurred_at desc);

alter table public.job_tasks enable row level security;
alter table public.job_task_events enable row level security;

-- Until job-scoped authenticated crew assignments exist, only managers can see tasks.
-- This avoids leaking tasks from unrelated jobs to business-level crew members.
create policy "Business managers can read job tasks"
on public.job_tasks
for select
to authenticated
using (public.user_can_manage_business(business_id));

create policy "Business managers can read job task events"
on public.job_task_events
for select
to authenticated
using (public.user_can_manage_business(business_id));

grant select on public.job_tasks to authenticated;
grant select on public.job_task_events to authenticated;
revoke insert, update, delete on public.job_tasks from authenticated;
revoke insert, update, delete on public.job_task_events from authenticated;

create or replace function public.record_job_task_event(
  p_task public.job_tasks,
  p_event_type text,
  p_title_snapshot text,
  p_source_type text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.job_task_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.job_task_events;
  v_activity_title text;
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  if p_event_type not in (
    'task_created',
    'task_renamed',
    'task_completed',
    'task_reopened',
    'task_cancelled'
  ) then
    raise exception 'Unsupported task event.';
  end if;

  insert into public.job_task_events (
    business_id,
    owner_id,
    job_id,
    task_id,
    actor_user_id,
    event_type,
    title_snapshot,
    source_type,
    idempotency_key,
    metadata
  )
  values (
    p_task.business_id,
    p_task.owner_id,
    p_task.job_id,
    p_task.id,
    v_actor,
    p_event_type,
    trim(p_title_snapshot),
    p_source_type,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'taskId', p_task.id,
      'taskTitle', trim(p_title_snapshot),
      'taskStatus', p_task.status,
      'sourceType', p_source_type
    )
  )
  on conflict (actor_user_id, idempotency_key)
  do nothing
  returning * into v_event;

  if v_event.id is null then
    select *
    into v_event
    from public.job_task_events
    where actor_user_id = v_actor
      and idempotency_key = p_idempotency_key;

    if v_event.task_id <> p_task.id or v_event.event_type <> p_event_type then
      raise exception 'That task event request key was already used.';
    end if;
  end if;

  v_activity_title := case p_event_type
    when 'task_created' then 'Task added'
    when 'task_renamed' then 'Task renamed'
    when 'task_completed' then 'Task completed'
    when 'task_reopened' then 'Task reopened'
    when 'task_cancelled' then 'Task cancelled'
  end;

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
    occurred_at
  )
  values (
    p_task.business_id,
    p_task.owner_id,
    v_actor,
    v_actor,
    p_task.job_id,
    p_event_type,
    'completed',
    'normal',
    'job_task_events',
    v_event.id,
    v_activity_title,
    trim(p_title_snapshot),
    v_event.metadata,
    v_event.occurred_at
  )
  on conflict (business_id, event_type, source_table, source_id)
  do nothing;

  return v_event;
end;
$$;

revoke all on function public.record_job_task_event(
  public.job_tasks,
  text,
  text,
  text,
  text,
  jsonb
) from public, authenticated;

create or replace function public.create_job_task(
  p_job_id uuid,
  p_title text,
  p_idempotency_key text
)
returns public.job_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs;
  v_task public.job_tasks;
  v_clean_title text := trim(coalesce(p_title, ''));
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'An idempotency key is required.';
  end if;

  select *
  into v_task
  from public.job_tasks
  where created_by_user_id = v_actor
    and creation_idempotency_key = p_idempotency_key;

  if v_task.id is not null then
    if v_task.job_id <> p_job_id then
      raise exception 'That task request key was already used for another job.';
    end if;
    return v_task;
  end if;

  if length(v_clean_title) = 0 or length(v_clean_title) > 240 then
    raise exception 'Task title must be between 1 and 240 characters.';
  end if;

  select *
  into v_job
  from public.jobs
  where id = p_job_id;

  if v_job.id is null then
    raise exception 'Job not found.';
  end if;

  if not public.user_can_manage_business(v_job.business_id) then
    raise exception 'Only a business owner or admin can manage job tasks.';
  end if;

  insert into public.job_tasks (
    business_id,
    owner_id,
    job_id,
    title,
    created_by_user_id,
    creation_idempotency_key
  )
  values (
    v_job.business_id,
    v_job.owner_id,
    v_job.id,
    v_clean_title,
    v_actor,
    p_idempotency_key
  )
  returning * into v_task;

  perform public.record_job_task_event(
    v_task,
    'task_created',
    v_task.title,
    'manual',
    p_idempotency_key || ':event',
    jsonb_build_object('previousStatus', null)
  );

  return v_task;
end;
$$;

revoke all on function public.create_job_task(uuid, text, text) from public;
grant execute on function public.create_job_task(uuid, text, text) to authenticated;

create or replace function public.change_job_task(
  p_task_id uuid,
  p_action text,
  p_title text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns public.job_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_event public.job_task_events;
  v_task public.job_tasks;
  v_previous_status text;
  v_previous_title text;
  v_event_type text;
  v_clean_title text := trim(coalesce(p_title, ''));
begin
  if v_actor is null then
    raise exception 'Authentication is required.';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'An idempotency key is required.';
  end if;

  v_event_type := case p_action
    when 'rename' then 'task_renamed'
    when 'complete' then 'task_completed'
    when 'reopen' then 'task_reopened'
    when 'cancel' then 'task_cancelled'
    else null
  end;

  if v_event_type is null then
    raise exception 'Unsupported task action.';
  end if;

  select *
  into v_existing_event
  from public.job_task_events
  where actor_user_id = v_actor
    and idempotency_key = p_idempotency_key;

  if v_existing_event.id is not null then
    if v_existing_event.task_id <> p_task_id or v_existing_event.event_type <> v_event_type then
      raise exception 'That task request key was already used for another task.';
    end if;

    select * into v_task from public.job_tasks where id = p_task_id;
    return v_task;
  end if;

  select *
  into v_task
  from public.job_tasks
  where id = p_task_id
  for update;

  if v_task.id is null then
    raise exception 'Task not found.';
  end if;

  if not public.user_can_manage_business(v_task.business_id) then
    raise exception 'Only a business owner or admin can manage job tasks.';
  end if;

  if p_expected_updated_at is not null and v_task.updated_at <> p_expected_updated_at then
    raise exception 'This task changed after you opened it. Refresh and try again.';
  end if;

  v_previous_status := v_task.status;
  v_previous_title := v_task.title;

  case p_action
    when 'rename' then
      if v_task.status <> 'open' then
        raise exception 'Only open tasks can be renamed.';
      end if;
      if length(v_clean_title) = 0 or length(v_clean_title) > 240 then
        raise exception 'Task title must be between 1 and 240 characters.';
      end if;
      if v_clean_title = v_task.title then
        raise exception 'Enter a different task title.';
      end if;
      update public.job_tasks
      set title = v_clean_title,
          version = version + 1,
          updated_at = clock_timestamp()
      where id = v_task.id
      returning * into v_task;

    when 'complete' then
      if v_task.status <> 'open' then
        raise exception 'Only open tasks can be completed.';
      end if;
      update public.job_tasks
      set status = 'completed',
          completed_by_user_id = v_actor,
          completed_at = clock_timestamp(),
          cancelled_by_user_id = null,
          cancelled_at = null,
          version = version + 1,
          updated_at = clock_timestamp()
      where id = v_task.id
      returning * into v_task;

    when 'reopen' then
      if v_task.status not in ('completed', 'cancelled') then
        raise exception 'Only completed or cancelled tasks can be reopened.';
      end if;
      update public.job_tasks
      set status = 'open',
          completed_by_user_id = null,
          completed_at = null,
          cancelled_by_user_id = null,
          cancelled_at = null,
          version = version + 1,
          updated_at = clock_timestamp()
      where id = v_task.id
      returning * into v_task;

    when 'cancel' then
      if v_task.status <> 'open' then
        raise exception 'Only open tasks can be cancelled.';
      end if;
      update public.job_tasks
      set status = 'cancelled',
          cancelled_by_user_id = v_actor,
          cancelled_at = clock_timestamp(),
          completed_by_user_id = null,
          completed_at = null,
          version = version + 1,
          updated_at = clock_timestamp()
      where id = v_task.id
      returning * into v_task;
  end case;

  perform public.record_job_task_event(
    v_task,
    v_event_type,
    v_task.title,
    'manual',
    p_idempotency_key,
    jsonb_build_object(
      'previousStatus', v_previous_status,
      'previousTitle', v_previous_title
    )
  );

  return v_task;
end;
$$;

revoke all on function public.change_job_task(uuid, text, text, timestamptz, text) from public;
grant execute on function public.change_job_task(uuid, text, text, timestamptz, text) to authenticated;
