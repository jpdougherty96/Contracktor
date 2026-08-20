-- Keep the complete production-main feature surface available to Free while
-- making the developing intelligence features Pro-only. This migration is
-- additive and remains compatible with clients that do not read entitlements.

insert into public.subscription_features (
  feature_key,
  name,
  description,
  category,
  display_order
)
values
  (
    'activity.feed',
    'Activity and Needs Attention',
    'Business-level automation history and exception supervision.',
    'Automation',
    115
  ),
  (
    'receipt.smart_allocation',
    'Smart receipt allocation',
    'Shopping-aware and multi-destination receipt intelligence.',
    'Receipts',
    125
  )
on conflict (feature_key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  display_order = excluded.display_order,
  is_active = true;

update public.subscription_features
set
  name = 'Shopping needs',
  description = 'Job-level and combined shopping needs with receipt fulfillment.',
  category = 'conTRACKtor Pro'
where feature_key = 'core.shopping';

insert into public.plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, false
from public.subscription_plans p
cross join public.subscription_features f
on conflict (plan_id, feature_id) do nothing;

-- Start from a closed Free plan, then explicitly enable only the functionality
-- available in the production main branch. New features therefore remain off
-- for Free unless a reviewed change deliberately enables them.
update public.plan_entitlements pe
set
  enabled = false,
  limit_value = null,
  config = '{}'::jsonb
from public.subscription_plans p
where pe.plan_id = p.id
  and p.plan_key = 'free';

update public.plan_entitlements pe
set enabled = true
from public.subscription_plans p,
     public.subscription_features f
where pe.plan_id = p.id
  and pe.feature_id = f.id
  and p.plan_key = 'free'
  and f.feature_key in (
    'core.jobs',
    'core.job_financials',
    'core.hours',
    'core.time_clock',
    'core.receipts',
    'core.receipt_extraction',
    'core.expenses',
    'core.payments',
    'core.notes_photos',
    'core.invoices_reports'
  );

update public.plan_entitlements pe
set enabled = true
from public.subscription_plans p
where pe.plan_id = p.id
  and p.plan_key = 'pro';

-- Historical Pro-created records remain readable after downgrade. Mutations
-- require the current business to retain the relevant feature.
drop policy if exists "Business members can create shopping needs" on public.shopping_needs;
create policy "Entitled business members can create shopping needs"
on public.shopping_needs
for insert
to authenticated
with check (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'core.shopping')
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
create policy "Entitled business members can update shopping needs"
on public.shopping_needs
for update
to authenticated
using (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'core.shopping')
)
with check (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'core.shopping')
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
create policy "Entitled business members can delete shopping needs"
on public.shopping_needs
for delete
to authenticated
using (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'core.shopping')
);

drop policy if exists "Business members can create shopping need fulfillments"
on public.shopping_need_fulfillments;
create policy "Entitled business members can create shopping need fulfillments"
on public.shopping_need_fulfillments
for insert
to authenticated
with check (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'core.shopping')
  and public.business_has_feature(business_id, 'receipt.smart_allocation')
  and exists (
    select 1
    from public.shopping_needs sn
    where sn.id = shopping_need_id
      and sn.business_id = shopping_need_fulfillments.business_id
  )
);

drop policy if exists "Business members can delete shopping need fulfillments"
on public.shopping_need_fulfillments;
create policy "Entitled business members can delete shopping need fulfillments"
on public.shopping_need_fulfillments
for delete
to authenticated
using (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'core.shopping')
);

-- Activity records are shared audit infrastructure and remain readable after a
-- downgrade. Resolving or deleting supervision items is an Activity feature.
drop policy if exists "Business managers can update activity events"
on public.activity_events;
create policy "Entitled business managers can update activity events"
on public.activity_events
for update
to authenticated
using (
  public.user_can_manage_business(business_id)
  and public.business_has_feature(business_id, 'activity.feed')
)
with check (
  public.user_can_manage_business(business_id)
  and public.business_has_feature(business_id, 'activity.feed')
);

drop policy if exists "Business managers can delete activity events"
on public.activity_events;
create policy "Entitled business managers can delete activity events"
on public.activity_events
for delete
to authenticated
using (
  public.user_can_manage_business(business_id)
  and public.business_has_feature(business_id, 'activity.feed')
);

drop policy if exists "Business members can create tell conTRACKtor entries"
on public.tell_contracktor_entries;
create policy "Entitled business members can create tell conTRACKtor entries"
on public.tell_contracktor_entries
for insert
to authenticated
with check (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'tell.basic')
  and auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1
      from public.jobs j
      where j.id = job_id
        and j.business_id = tell_contracktor_entries.business_id
    )
  )
);

drop policy if exists "Business members can update tell conTRACKtor entries"
on public.tell_contracktor_entries;
create policy "Entitled business members can update tell conTRACKtor entries"
on public.tell_contracktor_entries
for update
to authenticated
using (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'tell.basic')
)
with check (
  public.user_is_business_member(business_id)
  and public.business_has_feature(business_id, 'tell.basic')
);
