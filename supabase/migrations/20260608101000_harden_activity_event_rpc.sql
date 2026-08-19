create or replace function public.upsert_activity_event(
  p_business_id uuid,
  p_owner_id uuid,
  p_actor_user_id uuid,
  p_created_by_user_id uuid,
  p_job_id uuid,
  p_event_type text,
  p_status text,
  p_severity text,
  p_source_table text,
  p_source_id uuid,
  p_title text,
  p_detail text,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns public.activity_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.activity_events;
  v_auth_user uuid := auth.uid();
begin
  if p_business_id is null then
    raise exception 'business_id is required';
  end if;

  if p_owner_id is null then
    raise exception 'owner_id is required';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;

  if v_auth_user is not null and not public.user_is_business_member(p_business_id) then
    raise exception 'You are not allowed to write activity for this business.';
  end if;

  if v_auth_user is not null and coalesce(p_actor_user_id, v_auth_user) <> v_auth_user then
    raise exception 'actor_user_id must match the authenticated user.';
  end if;

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
  )
  values (
    p_business_id,
    p_owner_id,
    coalesce(p_actor_user_id, v_auth_user, p_owner_id),
    coalesce(p_created_by_user_id, v_auth_user, p_owner_id),
    p_job_id,
    p_event_type,
    coalesce(p_status, 'completed'),
    coalesce(p_severity, 'normal'),
    p_source_table,
    p_source_id,
    trim(p_title),
    p_detail,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_occurred_at, now()),
    case when coalesce(p_status, 'completed') = 'resolved' then now() else null end
  )
  on conflict (business_id, event_type, source_table, source_id)
  do update set
    actor_user_id = excluded.actor_user_id,
    created_by_user_id = excluded.created_by_user_id,
    job_id = excluded.job_id,
    status = excluded.status,
    severity = excluded.severity,
    title = excluded.title,
    detail = excluded.detail,
    metadata = excluded.metadata,
    occurred_at = excluded.occurred_at,
    resolved_at = case
      when excluded.status in ('completed', 'resolved') then coalesce(public.activity_events.resolved_at, now())
      else null
    end
  returning * into v_event;

  return v_event;
end;
$$;
