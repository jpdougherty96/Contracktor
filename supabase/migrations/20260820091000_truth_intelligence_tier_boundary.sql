-- Lock the product boundary around truth, intelligence, and coordination.
-- Free contains the complete job-truth layer. Pro adds interpretation and
-- automation. Exact AI usage limits remain unset until real usage is measured.

update public.subscription_plans
set
  name = 'conTRACKtor Free',
  description = 'Capture and understand the operational and financial truth of contractor jobs.',
  monthly_price_cents = 0,
  annual_price_cents = 0,
  updated_at = now()
where plan_key = 'free';

update public.subscription_plans
set
  name = 'conTRACKtor Pro',
  description = 'Intelligence and automation that works on top of trusted job records.',
  monthly_price_cents = 1900,
  annual_price_cents = 19000,
  updated_at = now()
where plan_key = 'pro';

insert into public.subscription_features (
  feature_key,
  name,
  description,
  category,
  display_order
)
values
  (
    'snapshot.ai_insights',
    'AI Job Snapshot insights',
    'Interpretation, explanations, and forecasts on top of deterministic job financials.',
    'Pro intelligence',
    260
  ),
  (
    'job.proactive_insights',
    'Proactive job insights',
    'Margin, budget, anomaly, and possible unbilled-work detection.',
    'Pro intelligence',
    270
  ),
  (
    'activity.business_feed',
    'Business-wide activity',
    'Cross-user business supervision and centralized owner oversight.',
    'Business coordination',
    400
  )
on conflict (feature_key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = now();

update public.subscription_features
set
  name = 'Activity and required attention',
  description = 'Permanent job activity plus items required to keep records correct.',
  category = 'Free truth',
  updated_at = now()
where feature_key = 'activity.feed';

update public.subscription_features
set
  name = 'Shopping needs',
  description = 'Job-level and combined shopping needs with manual management.',
  category = 'Free truth',
  updated_at = now()
where feature_key = 'core.shopping';

update public.subscription_features
set
  name = 'Tell conTRACKtor Basic',
  description = 'Scoped single-turn proposals for hours, notes, and shopping needs.',
  category = 'Free truth',
  updated_at = now()
where feature_key = 'tell.basic';

update public.subscription_features
set
  name = 'Smart receipt allocation',
  description = 'Shopping-aware matching and suggested multi-destination allocations.',
  category = 'Pro intelligence',
  updated_at = now()
where feature_key = 'receipt.smart_allocation';

insert into public.plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, false
from public.subscription_plans p
cross join public.subscription_features f
on conflict (plan_id, feature_id) do nothing;

-- Free is explicit. New features remain disabled until a reviewed decision
-- classifies them as job truth rather than intelligence or coordination.
update public.plan_entitlements pe
set
  enabled = false,
  limit_value = null,
  config = '{}'::jsonb,
  updated_at = now()
from public.subscription_plans p
where pe.plan_id = p.id
  and p.plan_key = 'free';

update public.plan_entitlements pe
set
  enabled = true,
  limit_value = null,
  config = '{}'::jsonb,
  updated_at = now()
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
    'core.shopping',
    'core.payments',
    'core.notes_photos',
    'core.invoices_reports',
    'activity.feed',
    'tell.basic'
  );

update public.plan_entitlements pe
set
  enabled = true,
  limit_value = null,
  config = '{}'::jsonb,
  updated_at = now()
from public.subscription_plans p
where pe.plan_id = p.id
  and p.plan_key = 'pro';
