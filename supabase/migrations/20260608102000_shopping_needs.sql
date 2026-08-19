create table if not exists public.shopping_needs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.default_business_for_user(auth.uid()) references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  initiated_by_user_id uuid references public.profiles(id) on delete set null,
  performed_by_type text not null default 'user',
  performed_by_user_id uuid references public.profiles(id) on delete set null,
  assigned_to_user_id uuid references public.profiles(id) on delete set null,
  source_type text,
  source_id uuid,
  description text not null,
  normalized_name text,
  quantity numeric,
  unit text,
  needed_by date,
  status text not null default 'open',
  notes text,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint shopping_needs_description_check check (length(trim(description)) > 0),
  constraint shopping_needs_performed_by_type_check check (performed_by_type in ('user', 'ai', 'system')),
  constraint shopping_needs_status_check check (status in ('open', 'fulfilled', 'dismissed')),
  constraint shopping_needs_quantity_check check (quantity is null or quantity > 0)
);

create table if not exists public.shopping_need_fulfillments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shopping_need_id uuid not null references public.shopping_needs(id) on delete cascade,
  receipt_line_item_id uuid references public.receipt_line_items(id) on delete set null,
  quantity numeric,
  source_type text,
  source_id uuid,
  initiated_by_user_id uuid references public.profiles(id) on delete set null,
  performed_by_type text not null default 'user',
  performed_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  constraint shopping_need_fulfillments_quantity_check check (quantity is null or quantity > 0),
  constraint shopping_need_fulfillments_performed_by_type_check check (performed_by_type in ('user', 'ai', 'system'))
);

alter table public.shopping_needs enable row level security;
alter table public.shopping_need_fulfillments enable row level security;

grant select, insert, update, delete on public.shopping_needs to authenticated;
grant select, insert, update, delete on public.shopping_need_fulfillments to authenticated;

create index if not exists shopping_needs_business_status_idx
on public.shopping_needs (business_id, status, created_at desc);

create index if not exists shopping_needs_job_status_idx
on public.shopping_needs (job_id, status, created_at desc);

create index if not exists shopping_needs_source_idx
on public.shopping_needs (source_type, source_id);

create index if not exists shopping_need_fulfillments_need_idx
on public.shopping_need_fulfillments (shopping_need_id, created_at desc);

create or replace function public.set_shopping_need_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is null then
    new.business_id := public.default_business_for_user(new.owner_id);
  end if;

  if new.initiated_by_user_id is null then
    new.initiated_by_user_id := coalesce(auth.uid(), new.owner_id);
  end if;

  if new.performed_by_user_id is null and new.performed_by_type = 'user' then
    new.performed_by_user_id := coalesce(auth.uid(), new.owner_id);
  end if;

  if new.normalized_name is null then
    new.normalized_name := lower(trim(new.description));
  end if;

  if new.status = 'fulfilled' and new.completed_at is null then
    new.completed_at := now();
  end if;

  if new.status = 'dismissed' and new.dismissed_at is null then
    new.dismissed_at := now();
  end if;

  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists set_shopping_need_owner_columns on public.shopping_needs;
create trigger set_shopping_need_owner_columns
before insert or update on public.shopping_needs
for each row execute function public.set_shopping_need_owner_columns();

create or replace function public.set_shopping_need_fulfillment_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need public.shopping_needs;
begin
  select *
  into v_need
  from public.shopping_needs
  where id = new.shopping_need_id;

  if v_need.id is null then
    raise exception 'Shopping need not found.';
  end if;

  if new.business_id is null then
    new.business_id := v_need.business_id;
  end if;

  if new.business_id <> v_need.business_id then
    raise exception 'Fulfillment business does not match shopping need business.';
  end if;

  if new.initiated_by_user_id is null then
    new.initiated_by_user_id := coalesce(auth.uid(), v_need.initiated_by_user_id, v_need.owner_id);
  end if;

  if new.performed_by_user_id is null and new.performed_by_type = 'user' then
    new.performed_by_user_id := coalesce(auth.uid(), v_need.owner_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_shopping_need_fulfillment_owner_columns on public.shopping_need_fulfillments;
create trigger set_shopping_need_fulfillment_owner_columns
before insert on public.shopping_need_fulfillments
for each row execute function public.set_shopping_need_fulfillment_owner_columns();

drop policy if exists "Business members can read shopping needs" on public.shopping_needs;
create policy "Business members can read shopping needs"
on public.shopping_needs
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can create shopping needs" on public.shopping_needs;
create policy "Business members can create shopping needs"
on public.shopping_needs
for insert
to authenticated
with check (
  public.user_is_business_member(business_id)
  and auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1
      from public.jobs j
      where j.id = job_id
        and j.business_id = shopping_needs.business_id
    )
  )
);

drop policy if exists "Business members can update shopping needs" on public.shopping_needs;
create policy "Business members can update shopping needs"
on public.shopping_needs
for update
to authenticated
using (public.user_is_business_member(business_id))
with check (
  public.user_is_business_member(business_id)
  and (
    job_id is null
    or exists (
      select 1
      from public.jobs j
      where j.id = job_id
        and j.business_id = shopping_needs.business_id
    )
  )
);

drop policy if exists "Business members can delete shopping needs" on public.shopping_needs;
create policy "Business members can delete shopping needs"
on public.shopping_needs
for delete
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can read shopping need fulfillments" on public.shopping_need_fulfillments;
create policy "Business members can read shopping need fulfillments"
on public.shopping_need_fulfillments
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can create shopping need fulfillments" on public.shopping_need_fulfillments;
create policy "Business members can create shopping need fulfillments"
on public.shopping_need_fulfillments
for insert
to authenticated
with check (
  public.user_is_business_member(business_id)
  and exists (
    select 1
    from public.shopping_needs sn
    where sn.id = shopping_need_id
      and sn.business_id = shopping_need_fulfillments.business_id
  )
);

drop policy if exists "Business members can delete shopping need fulfillments" on public.shopping_need_fulfillments;
create policy "Business members can delete shopping need fulfillments"
on public.shopping_need_fulfillments
for delete
to authenticated
using (public.user_is_business_member(business_id));
