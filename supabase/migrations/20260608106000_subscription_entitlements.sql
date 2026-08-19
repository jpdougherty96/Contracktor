create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_public boolean not null default true,
  is_default boolean not null default false,
  display_order integer not null default 0,
  monthly_price_cents integer,
  annual_price_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_key_check
    check (plan_key ~ '^[a-z][a-z0-9_]*$'),
  constraint subscription_plans_name_check
    check (length(trim(name)) > 0),
  constraint subscription_plans_monthly_price_check
    check (monthly_price_cents is null or monthly_price_cents >= 0),
  constraint subscription_plans_annual_price_check
    check (annual_price_cents is null or annual_price_cents >= 0)
);

create unique index if not exists subscription_plans_single_default_idx
on public.subscription_plans (is_default)
where is_default;

create table if not exists public.subscription_features (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  name text not null,
  description text,
  category text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_features_key_check
    check (feature_key ~ '^[a-z][a-z0-9_.]*$'),
  constraint subscription_features_name_check
    check (length(trim(name)) > 0),
  constraint subscription_features_category_check
    check (length(trim(category)) > 0)
);

create table if not exists public.plan_entitlements (
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_id uuid not null references public.subscription_features(id) on delete cascade,
  enabled boolean not null default false,
  limit_value bigint,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_id),
  constraint plan_entitlements_limit_check
    check (limit_value is null or limit_value >= 0),
  constraint plan_entitlements_config_check
    check (jsonb_typeof(config) = 'object')
);

create table if not exists public.business_subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'active',
  billing_provider text,
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_subscriptions_status_check
    check (status in ('active', 'trialing', 'grace', 'past_due', 'canceled', 'expired'))
);

create table if not exists public.business_entitlement_overrides (
  business_id uuid not null references public.businesses(id) on delete cascade,
  feature_id uuid not null references public.subscription_features(id) on delete cascade,
  enabled boolean,
  has_limit_override boolean not null default false,
  limit_value bigint,
  config jsonb not null default '{}'::jsonb,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, feature_id),
  constraint business_entitlement_overrides_limit_check
    check (limit_value is null or limit_value >= 0),
  constraint business_entitlement_overrides_config_check
    check (jsonb_typeof(config) = 'object'),
  constraint business_entitlement_overrides_value_check
    check (
      enabled is not null
      or has_limit_override
      or config <> '{}'::jsonb
    )
);

create table if not exists public.subscription_usage (
  business_id uuid not null references public.businesses(id) on delete cascade,
  metric_key text not null,
  period_start date not null,
  period_end date not null,
  quantity bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, metric_key, period_start),
  constraint subscription_usage_metric_key_check
    check (metric_key ~ '^[a-z][a-z0-9_.]*$'),
  constraint subscription_usage_period_check
    check (period_end > period_start),
  constraint subscription_usage_quantity_check
    check (quantity >= 0)
);

create index if not exists plan_entitlements_feature_idx
on public.plan_entitlements (feature_id, plan_id);

create unique index if not exists business_subscriptions_provider_subscription_idx
on public.business_subscriptions (billing_provider, provider_subscription_id)
where billing_provider is not null
  and provider_subscription_id is not null;

create index if not exists business_entitlement_overrides_expires_idx
on public.business_entitlement_overrides (expires_at)
where expires_at is not null;

create index if not exists subscription_usage_period_idx
on public.subscription_usage (business_id, period_end desc);

insert into public.subscription_plans (
  plan_key,
  name,
  description,
  is_active,
  is_public,
  is_default,
  display_order,
  monthly_price_cents,
  annual_price_cents
)
values
  (
    'free',
    'conTRACKtor Free',
    'The complete currently deployed conTRACKtor experience.',
    true,
    true,
    true,
    10,
    0,
    0
  ),
  (
    'pro',
    'conTRACKtor Pro',
    'Conversational job understanding, memory, and advanced AI capabilities.',
    true,
    true,
    false,
    20,
    null,
    null
  )
on conflict (plan_key) do nothing;

insert into public.subscription_features (
  feature_key,
  name,
  description,
  category,
  display_order
)
values
  ('core.jobs', 'Jobs and customers', 'Create and manage jobs and customer details.', 'Core', 10),
  ('core.job_financials', 'Job financials', 'Budgets, quotes, costs, and financial dashboards.', 'Core', 20),
  ('core.hours', 'Hours', 'Manual labor-hour entry and editing.', 'Core', 30),
  ('core.time_clock', 'Time clock', 'Start and stop job-level time tracking.', 'Core', 40),
  ('core.receipts', 'Receipts', 'Capture, review, and allocate receipts.', 'Core', 50),
  ('core.receipt_extraction', 'Receipt extraction', 'Existing AI-assisted receipt extraction.', 'Core', 60),
  ('core.expenses', 'Expenses', 'Manual and receipt-backed expense tracking.', 'Core', 70),
  ('core.shopping', 'Shopping lists', 'Job-level and combined shopping needs.', 'Core', 80),
  ('core.payments', 'Payments', 'Record customer payments.', 'Core', 90),
  ('core.notes_photos', 'Notes and photos', 'Job notes and photo attachments.', 'Core', 100),
  ('core.invoices_reports', 'Invoices and reports', 'Current invoice drafts, reports, and exports.', 'Core', 110),
  ('tell.basic', 'Tell conTRACKtor Basic', 'The current single-turn proposal workflow.', 'Tell conTRACKtor', 120),
  ('tell.conversation', 'Conversational Tell', 'Persistent multi-turn Tell conTRACKtor conversations.', 'Tell conTRACKtor', 200),
  ('tell.voice', 'Tell by voice', 'Speech input through the conversational pipeline.', 'Tell conTRACKtor', 210),
  ('tell.job_memory', 'Job memory', 'Durable job history and AI working understanding.', 'Tell conTRACKtor', 220),
  ('tell.job_questions', 'Job questions', 'Evidence-backed questions across job records.', 'Tell conTRACKtor', 230),
  ('tell.global', 'Global Tell', 'Business-level questions and cross-job context.', 'Tell conTRACKtor', 240),
  ('tell.job_creation', 'Conversational job creation', 'Create and enrich jobs through conversation.', 'Tell conTRACKtor', 250),
  ('automation.proactive', 'Proactive automation', 'Suggestions, warnings, and prepared administrative work.', 'Automation', 300)
on conflict (feature_key) do nothing;

insert into public.plan_entitlements (plan_id, feature_id, enabled)
select
  p.id,
  f.id,
  (
    f.feature_key like 'core.%'
    or f.feature_key = 'tell.basic'
  )
from public.subscription_plans p
cross join public.subscription_features f
where p.plan_key = 'free'
on conflict (plan_id, feature_id) do nothing;

insert into public.plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.subscription_plans p
cross join public.subscription_features f
where p.plan_key = 'pro'
on conflict (plan_id, feature_id) do nothing;

create or replace function public.seed_entitlements_for_new_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.plan_entitlements (plan_id, feature_id, enabled)
  select new.id, f.id, false
  from public.subscription_features f
  on conflict (plan_id, feature_id) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_entitlements_for_new_plan on public.subscription_plans;
create trigger seed_entitlements_for_new_plan
after insert on public.subscription_plans
for each row execute function public.seed_entitlements_for_new_plan();

create or replace function public.seed_entitlements_for_new_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.plan_entitlements (plan_id, feature_id, enabled)
  select p.id, new.id, false
  from public.subscription_plans p
  on conflict (plan_id, feature_id) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_entitlements_for_new_feature on public.subscription_features;
create trigger seed_entitlements_for_new_feature
after insert on public.subscription_features
for each row execute function public.seed_entitlements_for_new_feature();

insert into public.business_subscriptions (business_id, plan_id, status)
select b.id, p.id, 'active'
from public.businesses b
cross join public.subscription_plans p
where p.is_default
on conflict (business_id) do nothing;

create or replace function public.touch_subscription_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_subscription_plans on public.subscription_plans;
create trigger touch_subscription_plans
before update on public.subscription_plans
for each row execute function public.touch_subscription_configuration();

drop trigger if exists touch_subscription_features on public.subscription_features;
create trigger touch_subscription_features
before update on public.subscription_features
for each row execute function public.touch_subscription_configuration();

drop trigger if exists touch_plan_entitlements on public.plan_entitlements;
create trigger touch_plan_entitlements
before update on public.plan_entitlements
for each row execute function public.touch_subscription_configuration();

drop trigger if exists touch_business_subscriptions on public.business_subscriptions;
create trigger touch_business_subscriptions
before update on public.business_subscriptions
for each row execute function public.touch_subscription_configuration();

drop trigger if exists touch_business_entitlement_overrides on public.business_entitlement_overrides;
create trigger touch_business_entitlement_overrides
before update on public.business_entitlement_overrides
for each row execute function public.touch_subscription_configuration();

drop trigger if exists touch_subscription_usage on public.subscription_usage;
create trigger touch_subscription_usage
before update on public.subscription_usage
for each row execute function public.touch_subscription_configuration();

create or replace function public.assign_default_business_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  select id
  into v_plan_id
  from public.subscription_plans
  where is_default
  limit 1;

  if v_plan_id is not null then
    insert into public.business_subscriptions (business_id, plan_id, status)
    values (new.id, v_plan_id, 'active')
    on conflict (business_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_default_business_subscription on public.businesses;
create trigger assign_default_business_subscription
after insert on public.businesses
for each row execute function public.assign_default_business_subscription();

alter table public.subscription_plans enable row level security;
alter table public.subscription_features enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.business_entitlement_overrides enable row level security;
alter table public.subscription_usage enable row level security;

grant select on public.subscription_plans to authenticated;
grant select on public.subscription_features to authenticated;
grant select on public.plan_entitlements to authenticated;
grant select on public.business_subscriptions to authenticated;
grant select on public.business_entitlement_overrides to authenticated;
grant select on public.subscription_usage to authenticated;

create policy "Authenticated users can read subscription plans"
on public.subscription_plans
for select
to authenticated
using (true);

create policy "Authenticated users can read subscription features"
on public.subscription_features
for select
to authenticated
using (true);

create policy "Authenticated users can read plan entitlements"
on public.plan_entitlements
for select
to authenticated
using (true);

create policy "Business managers can read business subscriptions"
on public.business_subscriptions
for select
to authenticated
using (public.user_can_manage_business(business_id));

create policy "Business members can read entitlement overrides"
on public.business_entitlement_overrides
for select
to authenticated
using (public.user_is_business_member(business_id));

create policy "Business members can read subscription usage"
on public.subscription_usage
for select
to authenticated
using (public.user_is_business_member(business_id));

create or replace function public.get_my_entitlements(p_business_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_result jsonb;
begin
  v_business_id := coalesce(
    p_business_id,
    public.default_business_for_user(auth.uid()),
    (
      select bm.business_id
      from public.business_members bm
      where bm.user_id = auth.uid()
        and bm.status = 'active'
      order by bm.created_at asc
      limit 1
    )
  );

  if v_business_id is null or not public.user_is_business_member(v_business_id) then
    raise exception 'You are not allowed to read entitlements for this business.';
  end if;

  select jsonb_build_object(
    'business_id', v_business_id,
    'plan', jsonb_build_object(
      'key', p.plan_key,
      'name', p.name,
      'status', bs.status,
      'trial_ends_at', bs.trial_ends_at,
      'current_period_ends_at', bs.current_period_ends_at,
      'cancel_at_period_end', bs.cancel_at_period_end
    ),
    'features', coalesce(
      jsonb_object_agg(
        f.feature_key,
        jsonb_build_object(
          'enabled', coalesce(o.enabled, pe.enabled, false),
          'limit', case
            when coalesce(o.has_limit_override, false) then o.limit_value
            else pe.limit_value
          end,
          'config', coalesce(pe.config, '{}'::jsonb) || coalesce(o.config, '{}'::jsonb),
          'source', case when o.feature_id is not null then 'override' else 'plan' end
        )
        order by f.display_order, f.feature_key
      ) filter (where f.id is not null),
      '{}'::jsonb
    )
  )
  into v_result
  from public.business_subscriptions bs
  join public.subscription_plans p on p.id = bs.plan_id
  cross join public.subscription_features f
  left join public.plan_entitlements pe
    on pe.plan_id = p.id
   and pe.feature_id = f.id
  left join public.business_entitlement_overrides o
    on o.business_id = bs.business_id
   and o.feature_id = f.id
   and (o.expires_at is null or o.expires_at > now())
  where bs.business_id = v_business_id
    and f.is_active
  group by
    p.plan_key,
    p.name,
    bs.status,
    bs.trial_ends_at,
    bs.current_period_ends_at,
    bs.cancel_at_period_end;

  if v_result is null then
    raise exception 'No subscription is configured for this business.';
  end if;

  return v_result;
end;
$$;

create or replace function public.business_has_feature(
  p_business_id uuid,
  p_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      public.get_my_entitlements(p_business_id)
      #>> array['features', p_feature_key, 'enabled']
    )::boolean,
    false
  );
$$;

revoke execute on function public.get_my_entitlements(uuid) from public, anon;
revoke execute on function public.business_has_feature(uuid, text) from public, anon;

grant execute on function public.get_my_entitlements(uuid) to authenticated;
grant execute on function public.business_has_feature(uuid, text) to authenticated;
