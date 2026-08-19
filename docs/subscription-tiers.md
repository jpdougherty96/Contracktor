# conTRACKtor Subscription Tiers

This document defines the initial dynamic tier model. The database is the source of truth for plan membership and feature entitlements. Product code should ask for an entitlement by feature key instead of branching directly on a plan name.

## Initial Product Boundary

### conTRACKtor Free

Free contains the complete currently deployed product:

- jobs and customers
- job financials
- hours and time clock
- receipts and existing receipt extraction
- expenses
- shopping lists
- payments
- notes and photos
- current invoices, reports, and exports
- the current single-turn Tell conTRACKtor workflow

### conTRACKtor Pro

Pro contains everything in Free plus the developing intelligence layer:

- persistent Tell conTRACKtor conversations
- voice
- job memory and Snapshot
- evidence-backed job questions
- business-level Tell conTRACKtor
- conversational job creation
- future proactive automation

## Data Model

The subscription migration creates:

- `subscription_plans`: Free, Pro, and future public or internal plans
- `subscription_features`: stable feature keys understood by product code
- `plan_entitlements`: whether a plan has a feature, plus optional limits/configuration
- `business_subscriptions`: the plan currently assigned to each business
- `business_entitlement_overrides`: temporary or permanent per-business exceptions
- `subscription_usage`: period-based counters for future fair-use enforcement

Existing and newly created businesses default to Free. No current screen or capability is gated merely by adding this foundation.

## Resolution Rules

The `get_my_entitlements` database function resolves the effective configuration for a business:

1. Read its assigned plan.
2. Read every active feature's plan entitlement.
3. Apply any unexpired business override.
4. Return one JSON entitlement snapshot to the app or server capability.

An override wins over the plan for `enabled` and, when `has_limit_override` is true, `limit_value`. Override `config` is merged over plan `config`.

## Product-Code Rule

Use feature checks:

```ts
const entitlements = await fetchBusinessEntitlements();

if (isFeatureEnabled(entitlements, 'tell.conversation')) {
  // Show or execute the conversational experience.
}
```

Do not use plan-name checks:

```ts
// Avoid this. It prevents features from moving independently between plans.
if (plan === 'pro') {
  // ...
}
```

UI checks only control presentation. Any paid or usage-sensitive server capability must independently enforce the entitlement before reading protected context or spending AI credits.

## Changing Tier Definitions

Until a platform-admin UI exists, modify plan configuration through a reviewed migration or the Supabase SQL editor using an administrative account.

Enable or disable a feature for a plan:

```sql
update public.plan_entitlements pe
set enabled = true
from public.subscription_plans p,
     public.subscription_features f
where pe.plan_id = p.id
  and pe.feature_id = f.id
  and p.plan_key = 'free'
  and f.feature_key = 'tell.conversation';
```

Set a plan-level monthly limit:

```sql
update public.plan_entitlements pe
set
  enabled = true,
  limit_value = 10,
  config = '{"period":"month","metric":"tell_interaction"}'::jsonb
from public.subscription_plans p,
     public.subscription_features f
where pe.plan_id = p.id
  and pe.feature_id = f.id
  and p.plan_key = 'free'
  and f.feature_key = 'tell.basic';
```

Grant one business early access without changing its plan:

```sql
insert into public.business_entitlement_overrides (
  business_id,
  feature_id,
  enabled,
  reason,
  expires_at
)
select
  'BUSINESS_UUID'::uuid,
  f.id,
  true,
  'Pro beta access',
  now() + interval '30 days'
from public.subscription_features f
where f.feature_key = 'tell.conversation'
on conflict (business_id, feature_id)
do update set
  enabled = excluded.enabled,
  reason = excluded.reason,
  expires_at = excluded.expires_at;
```

Assign a business to Pro during development:

```sql
update public.business_subscriptions bs
set plan_id = p.id
from public.subscription_plans p
where bs.business_id = 'BUSINESS_UUID'::uuid
  and p.plan_key = 'pro';
```

## Operational Rules

- Never delete or hide historical business data after a downgrade.
- Store billing-provider state separately from feature definitions.
- Keep plan and feature tables free of provider secrets.
- Provider webhooks may assign plans, but clients may not update their own subscription.
- Record feature usage on the server, not from a client-supplied counter.
- Use an override for beta access instead of inventing temporary plans.
- Add new feature keys rather than changing the meaning of an existing key.
