create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  event_type text not null,
  status text not null default 'completed',
  severity text not null default 'normal',
  source_table text,
  source_id uuid,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  constraint activity_events_status_check
    check (status in ('completed', 'review_recommended', 'needs_attention', 'resolved')),
  constraint activity_events_severity_check
    check (severity in ('normal', 'warning', 'danger')),
  constraint activity_events_source_unique
    unique nulls not distinct (business_id, event_type, source_table, source_id)
);

alter table public.activity_events enable row level security;

grant select, insert, update, delete on public.activity_events to authenticated;

drop policy if exists "Business members can read activity events" on public.activity_events;
create policy "Business members can read activity events"
on public.activity_events
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can create activity events" on public.activity_events;
create policy "Business members can create activity events"
on public.activity_events
for insert
to authenticated
with check (
  public.user_is_business_member(business_id)
  and auth.uid() = owner_id
  and coalesce(actor_user_id, auth.uid()) = auth.uid()
);

drop policy if exists "Business managers can update activity events" on public.activity_events;
create policy "Business managers can update activity events"
on public.activity_events
for update
to authenticated
using (public.user_can_manage_business(business_id))
with check (public.user_can_manage_business(business_id));

drop policy if exists "Business managers can delete activity events" on public.activity_events;
create policy "Business managers can delete activity events"
on public.activity_events
for delete
to authenticated
using (public.user_can_manage_business(business_id));

create index if not exists activity_events_business_occurred_idx
on public.activity_events (business_id, occurred_at desc);

create index if not exists activity_events_business_status_idx
on public.activity_events (business_id, status, severity, occurred_at desc);

create index if not exists activity_events_source_idx
on public.activity_events (source_table, source_id);

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
    coalesce(p_actor_user_id, auth.uid(), p_owner_id),
    coalesce(p_created_by_user_id, auth.uid(), p_owner_id),
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

grant execute on function public.upsert_activity_event(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  jsonb,
  timestamptz
) to authenticated;
