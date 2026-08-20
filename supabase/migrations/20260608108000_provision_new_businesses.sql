-- The ownership foundation backfilled profiles that existed when it shipped.
-- Provision the same one-business owner model for every new profile so new
-- sign-ups receive a Free subscription and usable business context.

create or replace function public.provision_business_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select b.id
  into v_business_id
  from public.businesses b
  where b.owner_id = new.id
  order by b.created_at asc
  limit 1;

  if v_business_id is null then
    insert into public.businesses (owner_id, name)
    values (
      new.id,
      coalesce(
        nullif(trim(new.company_name), ''),
        nullif(trim(new.full_name), ''),
        'My Business'
      )
    )
    returning id into v_business_id;
  end if;

  insert into public.business_members (business_id, user_id, role, status)
  values (v_business_id, new.id, 'owner', 'active')
  on conflict (business_id, user_id)
  do update set
    role = 'owner',
    status = 'active',
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists provision_business_for_new_profile on public.profiles;
create trigger provision_business_for_new_profile
after insert on public.profiles
for each row execute function public.provision_business_for_profile();

-- Repair any profile created between the ownership migration and this trigger.
insert into public.businesses (owner_id, name)
select
  p.id,
  coalesce(
    nullif(trim(p.company_name), ''),
    nullif(trim(p.full_name), ''),
    'My Business'
  )
from public.profiles p
where not exists (
  select 1
  from public.businesses b
  where b.owner_id = p.id
);

insert into public.business_members (business_id, user_id, role, status)
select b.id, b.owner_id, 'owner', 'active'
from public.businesses b
where not exists (
  select 1
  from public.business_members bm
  where bm.business_id = b.id
    and bm.user_id = b.owner_id
)
on conflict (business_id, user_id)
do update set
  role = 'owner',
  status = 'active',
  updated_at = now();
