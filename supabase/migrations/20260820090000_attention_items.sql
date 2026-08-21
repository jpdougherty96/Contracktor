-- Activity is durable history. Attention items are the mutable work queue that
-- points back to that history or to another source record.
create table if not exists public.attention_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  activity_event_id uuid references public.activity_events(id) on delete set null,
  assigned_to_user_id uuid references public.profiles(id) on delete set null,
  resolved_by_user_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  item_type text not null,
  status text not null default 'open',
  severity text not null default 'warning',
  source_table text,
  source_id uuid,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attention_items_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint attention_items_severity_check
    check (severity in ('warning', 'danger')),
  constraint attention_items_title_check
    check (length(trim(title)) > 0),
  constraint attention_items_source_unique
    unique nulls not distinct (business_id, item_type, source_table, source_id)
);

alter table public.attention_items enable row level security;

grant select on public.attention_items to authenticated;
grant all on public.attention_items to service_role;

create index if not exists attention_items_business_status_idx
on public.attention_items (business_id, status, opened_at desc);

create index if not exists attention_items_job_status_idx
on public.attention_items (job_id, status, opened_at desc);

create index if not exists attention_items_activity_event_idx
on public.attention_items (activity_event_id);

drop policy if exists "Business members can read attention items"
on public.attention_items;
create policy "Business members can read attention items"
on public.attention_items
for select
to authenticated
using (public.user_is_business_member(business_id));

create or replace function public.resolve_attention_item(
  p_attention_item_id uuid,
  p_resolution_status text default 'resolved',
  p_resolution_note text default null
)
returns public.attention_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_item public.attention_items;
begin
  if p_resolution_status not in ('resolved', 'dismissed') then
    raise exception 'resolution status must be resolved or dismissed';
  end if;

  select *
  into v_item
  from public.attention_items
  where id = p_attention_item_id;

  if v_item.id is null then
    raise exception 'Attention item not found.';
  end if;

  if v_auth_user is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.user_can_manage_business(v_item.business_id)
    or not public.business_has_feature(v_item.business_id, 'activity.feed') then
    raise exception 'You are not allowed to resolve this attention item.';
  end if;

  update public.attention_items
  set
    status = p_resolution_status,
    resolved_at = now(),
    resolved_by_user_id = v_auth_user,
    resolution_note = nullif(trim(p_resolution_note), ''),
    updated_at = now()
  where id = p_attention_item_id
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.resolve_attention_item(uuid, text, text) from public;
grant execute on function public.resolve_attention_item(uuid, text, text) to authenticated;

create or replace function public.resolve_receipt_attention(p_receipt_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_business_id uuid;
  v_receipt_status text;
  v_review_status text;
  v_resolved_count integer;
begin
  if v_auth_user is null then
    raise exception 'Authentication is required.';
  end if;

  select business_id, status, review_status
  into v_business_id, v_receipt_status, v_review_status
  from public.receipts
  where id = p_receipt_id;

  if v_business_id is null then
    raise exception 'Receipt not found.';
  end if;

  if not public.user_is_business_member(v_business_id)
    or not public.business_has_feature(v_business_id, 'activity.feed') then
    raise exception 'You are not allowed to resolve attention for this receipt.';
  end if;

  if v_receipt_status <> 'accepted' or v_review_status <> 'reviewed' then
    raise exception 'Finish reviewing the receipt before resolving its attention item.';
  end if;

  update public.attention_items
  set
    status = 'resolved',
    resolved_at = now(),
    resolved_by_user_id = v_auth_user,
    resolution_note = 'Receipt review completed.',
    updated_at = now()
  where business_id = v_business_id
    and item_type = 'receipt_activity'
    and source_table = 'receipts'
    and source_id = p_receipt_id
    and status = 'open';

  get diagnostics v_resolved_count = row_count;
  return v_resolved_count;
end;
$$;

revoke all on function public.resolve_receipt_attention(uuid) from public;
grant execute on function public.resolve_receipt_attention(uuid) to authenticated;

-- Preserve the unresolved supervision state already stored in activity_events.
-- Later application versions read and resolve these rows through attention_items;
-- the original activity rows remain as the historical record.
insert into public.attention_items (
  business_id,
  owner_id,
  activity_event_id,
  job_id,
  item_type,
  status,
  severity,
  source_table,
  source_id,
  title,
  detail,
  metadata,
  opened_at
)
select
  ae.business_id,
  ae.owner_id,
  ae.id,
  ae.job_id,
  ae.event_type,
  'open',
  case when ae.severity = 'danger' then 'danger' else 'warning' end,
  ae.source_table,
  ae.source_id,
  ae.title,
  ae.detail,
  ae.metadata,
  ae.occurred_at
from public.activity_events ae
where ae.status in ('needs_attention', 'review_recommended')
on conflict (business_id, item_type, source_table, source_id)
do nothing;
