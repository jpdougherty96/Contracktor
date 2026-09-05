# conTRACKtor Development Roadmap

This roadmap turns the Product Rulebook into a practical build sequence. It is intentionally iterative: implementation discoveries can change details, but changes to the sequence should be explicit and justified.

The current finish line and scope test are defined in
[mvp-definition.md](mvp-definition.md). The MVP definition takes priority over
later roadmap ideas when deciding what to build next.

Scope note: this roadmap excludes online payment processor implementation. "Get Paid" remains part of the product philosophy, but Stripe/ACH/card processing is not part of this immediate plan.

## Build Strategy

The sequence is:

```txt
Remove obvious friction
-> make processing durable
-> fix ownership
-> create supervision
-> build safe AI primitives
-> add useful structured concepts
-> let features reinforce each other
-> expose natural-language control
```

Do not let future architecture prevent obvious friction reductions today. In particular, one-tap receipt capture should not wait for team accounts, shopping needs, or voice.

All roadmap work ships from one codebase. The accurate job-truth layer is the
protected Free baseline. Pro intelligence and Business coordination remain
behind runtime entitlements, and a broken or unavailable paid capability must
not prevent a business from completing a Free workflow.

## Current Implementation Checkpoint — August 20, 2026

The codebase and shared `contracktor-dev` backend are stable through the
ownership and dynamic-entitlement foundations. TypeScript, lint, tier tests,
and the production web export pass locally. The Vercel/domain incident is an
external hosting issue and is not part of this development sequence.

What is already implemented:

- Steps 1-4A are represented in the routed app and synchronized remote migrations.
- Activity, Shopping Needs, and a single-turn Tell conTRACKtor flow exist as
  Free truth-layer slices. Shopping-aware receipt suggestions remain Pro
  intelligence.
- The durable receipt worker and all three Edge Functions are active on the
  shared development backend.
- Supervision uses separate, server-owned `attention_items`; Activity remains
  permanent history while the attention queue can be resolved.
- Reviewed Tell proposals commit through one atomic, idempotent server
  capability. Tell can undo unchanged records without overriding later human
  corrections. Payments are deliberately outside the initial Tell scope.
- Each Job opens with a deterministic Snapshot of required attention, shopping,
  hours, recorded cost, fixed-bid balance/profit, and latest activity.
- The current local Home revision presents Capture Receipt, Tell conTRACKtor,
  and Start Work as the primary capture methods. Payments, inventory, and
  manual record entry remain available in deeper job workflows.

What is only partially complete:

- Focused Tell follow-up for ambiguous fields is still limited to choosing a job
  and editing the reviewed proposals.
- The MVP has not yet passed the one-real-job end-to-end acceptance run.
- Step 12 voice input has not been implemented as a first-class pipeline.

### How automation behaves today

No part of conTRACKtor commits a record without a human approving it. Tell
conTRACKtor proposes: "Here is what I got" -> Approve All -> Saved -> Undo, and the
commit runs through one atomic idempotent server RPC. The receipt worker extracts and
proposes; review is a human step.

The three-level automation model in rulebook §9, and the "Saved · Undo" and
"high-confidence work completes without approval" language in steps 5, 8, and 10 of
this file, describe **target states for those steps**. None of it is shipped. Do not
write code that assumes an existing auto-commit path, and do not describe the product
as acting on its own.

Accurate framing for today: **AI interprets. Humans approve. Code commits.**

### Build order

Section numbers are stable identifiers, not sequence. The queue is:

```txt
1. One-real-job end-to-end acceptance run          (see Current sequence below)
2. 13.0 shared server entitlement helpers
3. 13.1 AI usage metering, shadow mode first        <- gates widening the Free cohort
4. 13.2 Free deterministic detectors
5. 13.3 Free remedy at the point of the finding
6. Free release
7. 13.4 Pro Watch, disabled by default
8. 12   Tell conTRACKtor voice
```

Metering blocks a wider Free cohort because Free AI usage is uncapped today. Voice is
post-Free-release work; it is numbered 12 only because it was specified earlier.

Current sequence:

```txt
Run one real job end to end
-> fix only the friction or truth gaps found in that run
-> declare the MVP acceptance loop complete
```

First-class voice, proactive automation, and broader business-assistant
behavior wait until the real-job MVP test passes.

## 1. Rulebook / README Alignment

Goal: keep the documentation roles clean.

- README describes current implementation.
- Product Rulebook governs future workflow/product decisions.
- Roadmap describes intended build order.

Acceptance criteria:

- README links to the Product Rulebook and this roadmap.
- README does not describe future aspirations as current functionality.
- Future workflow decisions can be audited against the rulebook.

## 2. One-Tap Receipt Capture

Goal: prove the rulebook with an immediate visible reduction in friction.

Current pain:

```txt
Open
-> Add expense
-> choose job(s)
-> receipt/manual
-> add receipt
-> camera
-> process
-> review
-> save
```

Target first improvement:

```txt
Open
-> Capture receipt
-> camera
```

Implementation direction:

- Add a direct Capture Receipt action from home.
- Preserve job context when launched from a job.
- Avoid requiring job selection before capture unless technically necessary.
- Keep existing deeper flows as fallbacks.

Do not try to solve all intelligent allocation in this step.

Done when:

- Home has a direct Capture Receipt action.
- The camera can be reached without choosing job/category first.
- Existing job-specific receipt flows still work.
- Captures launched from a job preserve that job as context.
- Current receipt save/review behavior remains functional as a fallback.

## 3. Durable Server-Owned Receipt Processing

Goal: make "Capture -> Receipt secured -> user can leave" real.

Target:

```txt
Capture
-> upload source
-> create durable processing record
-> show Receipt secured
-> server processes extraction
-> result appears through existing receipt/status UI, and later Activity or Needs Attention
```

Implementation direction:

- Move long-running extraction ownership off the client.
- Add durable processing statuses.
- Make extraction retryable and idempotent.
- Preserve original receipt image before AI processing.
- Ensure failures become actionable states.
- Every retryable stage and consequential commit has a stable idempotency boundary.

Design this as a reusable processing pattern where practical, not a receipt-only dead end. Future consumers may include AI commands, reports, invoices, photo analysis, imports, and job snapshots.

PWA/mobile constraint:

- Do not show "secured" until the server has durable source data.
- If offline/local queue support exists later, say "Saved on device" instead of implying server persistence.

Until Activity and Needs Attention exist, expose processing outcomes through the existing receipt/status UI. Do not delay durable processing waiting for Step 5.

Done when:

- A receipt can be uploaded and marked secured before extraction completes.
- Closing the app/browser after "Receipt secured" does not stop server processing.
- Processing success updates the receipt record.
- Processing failure leaves an actionable error state.
- Retrying extraction cannot duplicate downstream records.

## 4. Minimal Business / Team Ownership Foundation

Goal: lay ownership rails before creating new AI-native tables and activity records.

This is not full crew-account UX. It is the minimal data/security foundation.

Target concepts:

```txt
businesses

business_members
- business_id
- user_id
- role

roles:
- owner
- admin
- crew
```

New records should move toward:

```txt
business_id
created_by_user_id
actor_user_id where useful
```

Implementation direction:

- Introduce business ownership without breaking existing single-user behavior.
- Create one business for each existing owner.
- Create owner membership rows for existing users.
- Backfill `business_id` onto relevant existing business-owned data, including jobs, receipts, receipt line items, expenses, time entries, notes, payments, crew records, and future-compatible source records.
- Establish business-aware RLS for existing and new business-owned data.
- Keep owner-id compatibility only as long as necessary during migration.
- Think through RLS before expanding cross-user data.
- Keep current owner-led workflow working.
- Avoid building payroll, scheduling, or full crew onboarding here.

Why this comes before Activity:

Activity inherently needs to know which business an event occurred in, who initiated it, who/what acted, and who may see it.

Done when:

- Existing single-user accounts each have a business and owner membership.
- Core business data is addressable by `business_id`.
- Existing app workflows still work for the owner.
- RLS prevents users from reading/writing other businesses' data.
- New business-owned tables have a clear business ownership pattern.

## 4A. Dynamic Subscription Entitlements

Goal: preserve a complete and accurate truth layer in Free while allowing
intelligence and coordination features to move dynamically between Free, Pro,
Business, and future plans.

Implementation direction:

- Plans, features, plan entitlements, business assignments, and business overrides live in the database.
- Existing and new businesses default to Free.
- Free includes Activity/required attention, Shopping, basic Tell, and every
  capability needed for accurate source records and deterministic job truth.
- Smart receipt allocation, proactive/cross-record intelligence, higher AI
  usage, and AI Snapshot interpretation begin in Pro.
- Multi-contributor coordination begins in Business.
- Product code checks feature entitlements, not hardcoded plan names.
- UI gating is convenience; server capabilities enforce paid access and usage.
- No existing record becomes inaccessible after downgrade.
- Shared security, ownership, processing durability, and data-integrity work is
  available to both plans and is never treated as a paid feature.
- Entitlement lookup failures fall back to known Free client capabilities while
  paid server operations fail closed.

The working tier definition and management examples are in [subscription-tiers.md](subscription-tiers.md).

Done when:

- Free and Pro can be reconfigured without an app release.
- A business can receive a temporary feature override for beta testing.
- The app can retrieve one effective entitlement snapshot for the current business.
- An automated and manual regression matrix verifies the production Free baseline.
- Adding or changing a Pro feature does not gate any Free baseline workflow.

## 5. Activity + Needs Attention

Goal: create the supervision layer for automation.

Use two primary states:

```txt
Activity
conTRACKtor completed something. No action required.

Needs Attention
conTRACKtor cannot safely finish without human input.
```

Activity examples:

```txt
Joe captured $57.42 at Lowe's.
conTRACKtor assigned it to Benson.
Auto-assigned · Crew entry
[Change] [View]
```

Needs Attention examples:

```txt
Joe captured $143.18 at Menards.
2 items could not be matched.
[Finish receipt]
```

Data model direction:

- `activity_events` should be immutable history: what happened, business, actor/source attribution, action type, source reference, and timestamp.
- `attention_items` should be actionable state: open, resolved, dismissed, assigned/resolved metadata, and references to source records or activity events.

Implementation direction:

- Completed high-confidence work should not require owner approval.
- Ambiguity, failures, and consequential uncertainty go to Needs Attention.
- Notifications should be disciplined; successful routine work should usually appear quietly in Activity.

Done when:

- Completed work can be shown in Activity without requiring approval.
- Items that require user action appear as open attention items.
- Resolving an attention item does not erase the activity history.
- Activity and attention visibility respect business membership/role.

## 6. Safe AI Capability Layer

Goal: prevent AI from becoming a service-role database actor.

Rule:

```txt
AI does not get Supabase.
AI gets conTRACKtor capabilities.
```

The model is the reasoning layer, not the authority layer.

Target shape:

```txt
AI
-> chooses/request capabilities
-> conTRACKtor validates auth, roles, inputs, consequence, idempotency
-> database writes happen through application logic
```

Initial capabilities may include:

- read job context
- read open shopping needs
- create shopping need
- update shopping need
- create note
- prepare time entry
- commit time entry
- prepare receipt allocation
- commit receipt allocation

The manual UI and natural-language paths should eventually converge on the same underlying validated business logic.

Done when:

- Initial capabilities enforce auth, business scope, role, validation, and consequence policy.
- AI-facing code cannot directly perform arbitrary Supabase reads/writes.
- Manual UI can share at least one capability with the AI path.
- Capability calls have auditable inputs/results where consequential.

## 7. Shopping Needs

Goal: create lightweight, persistent job-level shopping state.

This is not full inventory and not shopping runs.

A shopping need should be:

- saveable
- visible
- checkable
- dismissible
- traceable to source
- usable as context for receipt allocation
- capable of being fulfilled by receipt lines

V1 concepts:

```txt
shopping_needs
- business_id
- job_id
- initiated_by_user_id
- performed_by_type
- performed_by_user_id
- assigned_to_user_id
- source_type
- source_id
- description
- normalized_name
- quantity
- unit
- needed_by
- status
- created_at
- updated_at
```

Fulfillment should use a relationship table so partial and multi-source fulfillment can be represented:

```txt
shopping_need_fulfillments
- business_id
- shopping_need_id
- receipt_line_id
- quantity
- source_type
- source_id
- initiated_by_user_id
- performed_by_type
- performed_by_user_id
- created_at
```

The need's displayed status can be derived or updated from fulfillment state, but do not rely only on `fulfilled_at` when partial fulfillment is possible.

V1 UI:

- job-level shopping list
- combined shopping list across selected/open jobs
- manual add/edit/check off as fallback

Done when:

- Shopping needs can be created, edited, checked off/dismissed, and viewed by job.
- A combined list can show open needs across selected/open jobs.
- Needs preserve source/provenance.
- Partial fulfillment is not blocked by the schema.

## 8. AI Notes/Text -> Shopping Needs

Goal: first embedded AI workflow using safe capabilities.

Example:

```txt
User is on Benson and says/types:
"Need four 2-inch PVC elbows and another box of screws."

conTRACKtor:
-> preserves original note/transcript
-> creates structured shopping needs
-> shows Saved · Undo
```

Why this is a good first AI test:

- low-risk
- reversible
- useful
- tests context
- tests natural language -> structured data
- tests source preservation
- tests safe capability calls

Done when:

- A note/text entry can produce one or more proposed shopping needs.
- High-confidence low-risk needs can be saved with Undo.
- Ambiguous needs ask a focused question or remain editable.
- The original note/text remains preserved and linked.

## 9. Shopping Needs -> Receipt Intelligence

Goal: use known purchase intent as evidence for receipt allocation.

Example:

```txt
Benson needs:
- PVC elbows
- screws

Miller needs:
- treated 2x8
- joist hangers

Lowe's receipt arrives.

conTRACKtor matches receipt lines to open needs and proposes allocation.
```

Implementation direction:

- Match receipt lines to open shopping needs.
- Propose fulfillment of needs.
- Use proposed receipt-line-to-need matches as evidence for proposed job allocation.
- Commit shopping-need fulfillment only after allocation/reconciliation is accepted or safely committed.
- Preserve correction history to improve future matching.

Done when:

- Receipt lines can be proposed as fulfilling open shopping needs.
- Proposed matches can influence job allocation suggestions.
- Accepted matches create fulfillment records without duplicate fulfillment on retry.
- Corrections are captured for future matching.

## 10. Smarter Multi-Destination Receipt Allocation

Goal: make the two-jobs-plus-inventory receipt practical.

Target:

```txt
AI interprets line items.
AI proposes grouped destinations.
Code calculates tax, discounts, rebates, totals, and reconciliation.
Human answers only genuine uncertainty.
```

Implementation direction:

- Assign by group where possible, not line-by-line by default.
- Use shopping needs, current job, assigned jobs, recent activity, and correction history as evidence.
- Keep deterministic code responsible for financial math.
- Initially require review/approval for meaningful multi-destination splits.
- Later, high-confidence splits may become completed Activity with Change/Undo if correction history supports it.

Done when:

- Multi-destination receipts show grouped proposed allocations.
- Tax/discount/rebate math is deterministic and reconciled.
- The user is asked only for uncertain or consequential decisions.
- Accepted splits create correct job/inventory financial records without duplicates.

## 10.5. Fuel & Vehicle Receipt Intelligence

Goal: make fuel receipts tax-ready with capture-first UX.

This should not move ahead of the business/team ownership and Activity foundation. It belongs after conTRACKtor has durable receipt processing, business scope, actor attribution, and a supervision model.

Target:

```txt
Capture gas receipt
-> conTRACKtor recognizes fuel
-> extracts vendor/date/location/gallons/fuel type/price per gallon
-> separates fuel from non-fuel purchases
-> saves or asks only for uncertainty
```

Implementation direction:

- Treat fuel as receipt intelligence, not a manual form-first workflow.
- Extract fuel-specific facts when visible: gallons, fuel type, price per gallon, station/location, total fuel amount, and non-fuel amount.
- Do not blindly classify an entire convenience-store receipt as fuel when it contains food, tools, or other purchases.
- Eventually support vehicle/equipment assignment, but do not require vehicle selection for the first useful version unless needed for the user's tax workflow.
- Use tax-ready language such as "Fuel & vehicle expenses"; do not imply tax deductibility decisions that depend on the contractor's accounting method or tax advisor.

Possible future data shape:

```txt
vehicle_expenses / fuel_expenses
- business_id
- captured_by_user_id
- receipt_id
- vehicle_id nullable
- vendor
- location
- purchase_date
- fuel_type
- gallons
- price_per_gallon
- fuel_amount
- non_fuel_amount
- total_amount
- status
```

Done when:

- Fuel receipts can be identified from receipt extraction.
- Fuel and non-fuel portions can be represented separately.
- The source receipt remains linked.
- The user gets a tax-ready fuel/vehicle expense record without manual category entry on normal receipts.

## 11. Tell conTRACKtor — Text

Goal: validate generalized natural-language control without speech complexity.

Example input:

```txt
Joe and I worked 8 hours on Benson and we need another box of deck screws.
```

Expected behavior:

- parse intent
- identify relevant capabilities
- prepare/commit low-risk actions as allowed
- ask focused questions for ambiguity
- preserve original text
- show clear results with Undo where appropriate

Why text first:

- easier to test
- easier to debug
- separates understanding/action from transcription quality

Done when:

- Typed natural-language input can invoke at least two capabilities in one request.
- Ambiguity produces focused follow-up instead of a full form.
- Low-risk committed actions are undoable.
- Consequential actions are prepared for approval rather than silently executed.

## 12. Tell conTRACKtor — Voice

Goal: add microphone input to the same pipeline.

Architecture:

```txt
speech
-> transcription
-> same Tell conTRACKtor text pipeline
```

Voice is an interface enhancement, not a second AI system.

Done when:

- Speech is transcribed into the same text pipeline.
- Voice does not bypass text-pipeline authorization, validation, consequence, or audit rules.
- Failed transcription does not lose the user's intent without a recovery path.

## 13. Tier Implementation — Metering, Free Detectors, and the Pro Watch

Governing documents: [subscription-tiers.md](subscription-tiers.md) and rulebook §2A.
Read both before starting. This section is the build sequence for that doctrine.

**Position in this file is not position in the queue.** See **Build order** in the
Current Implementation Checkpoint: 13.0-13.3 are Free-release work and come directly
after the acceptance run, ahead of section 12; 13.4 follows the Free release.

**The architectural rule for the whole section: one SQL function, two callers.**
A detector is written once as deterministic SQL. Free calls it from the client, on
demand, and persists nothing. Pro calls the same function from a scheduled worker,
persists findings as `attention_items`, and attaches the remedy. *Proof* is a
property of the function; *initiative* is a property of the caller. Nothing else
encodes the tier boundary.

### 13.0 Shared server entitlement helpers — do this first

Two blockers exist today:

- `snapshotHasFeature` is defined inline at `supabase/functions/tell-contracktor/index.ts:780`
  and is unreachable from the other Edge Functions.
- `public.get_my_entitlements` resolves the business through `auth.uid()` and raises
  through `user_is_business_member` when there is no JWT. **A service-role worker
  therefore cannot call `get_my_entitlements` or `business_has_feature`.** Any watch
  worker that tries will fail at runtime.

Work:

1. Create `supabase/functions/_shared/entitlements.ts` exporting `readEntitlementBusinessId`,
   `snapshotHasFeature`, and a new `snapshotFeatureLimit(snapshot, key): number | null`.
   Move the existing implementations out of `tell-contracktor/index.ts` and import them
   there. No behavior change.
2. New migration `<timestamp>_service_entitlements.sql`:
   - `public.business_entitlement_snapshot(p_business_id uuid) returns jsonb` — the body of
     `get_my_entitlements` **without** the membership check, `security definer`,
     `set search_path = public`.
   - `public.service_business_has_feature(p_business_id uuid, p_feature_key text) returns boolean`
     built on it.
   - `revoke execute` from `public`, `anon`, and `authenticated`; `grant execute` to
     `service_role` only.
   - Do **not** modify `get_my_entitlements` or `business_has_feature`. They are deployed
     contracts; this is expand-first.

Done when: tsc, lint, `npm test`, and the web build pass; Tell behavior is unchanged; and
an integration assertion proves the two new functions are not executable by the
`authenticated` role.

### 13.1 Usage metering — Free release gate

There are exactly three model call sites: `tell-contracktor/index.ts:705`, and
`_shared/receipt-processing.ts:210` and `:409`. **Reserve before the call, never after.**

New migration `<timestamp>_usage_metering.sql`:

- Table `public.subscription_usage_events (business_id, metric_key, idempotency_key,
  quantity, created_at, primary key (business_id, metric_key, idempotency_key))`.
  This is what makes retries safe; the queues do retry.
- Function:

```sql
public.consume_subscription_usage(
  p_business_id uuid,
  p_metric_key text,
  p_period_start date,
  p_period_end date,
  p_quantity bigint,
  p_idempotency_key text
) returns jsonb
```

  `security definer`, `service_role` only. Insert the event row `on conflict do nothing`;
  only when a row was actually inserted, upsert `subscription_usage.quantity` for the
  period. Return `{"quantity": n, "limit": n or null, "allowed": bool, "counted": bool}`,
  reading the limit from `business_entitlement_snapshot` → `features` → key → `limit`.

Metric keys: `ai.receipt_extraction`, `ai.tell_submission`. Period is the calendar month.
Idempotency key is the receipt id for extraction and the Tell entry id for Tell.

Enforcement mode is an Edge Function env var `AI_USAGE_ENFORCEMENT` with values
`shadow` (default) and `enforce`. **Run shadow for at least seven days before enforcing.**
Setting the cap number is a decision made from that data, not before it.

When enforcing and over limit:

- Receipt: skip extraction, leave the receipt capturable, raise an attention item with
  `item_type = 'receipt.manual_entry_required'`. **Never fail the capture.**
- Tell: return success with a plain message. Never block a record-creation path.
- The server returns a neutral reason code. Upgrade copy lives in the client only
  (rulebook §2A, tiebreaker 1: secondary, non-modal, off the critical path).

Also wire up `getFeatureLimit` in `src/lib/entitlements.ts:74`, which is currently dead code.

### 13.2 Free deterministic detectors

One migration, `<timestamp>_job_findings.sql`. Every function: `stable`,
`security definer`, `set search_path = public`, `grant execute to authenticated`, and an
explicit membership guard in the shape used by `get_job_invoice_draft`
(`invoice_ledger.sql:337`). **No entitlement check — these are Free for every business.**

Exact predicates, verified against the ledger's own validation:

- **Unbilled labor**: `time_entries` where `job_id = p_job_id and status = 'reviewed' and
  invoice_id is null and duration_minutes > 0 and hourly_rate > 0`.
  **Do not filter on `time_entries.billable`.** It defaults to false and nothing in the
  codebase sets it true; the ledger requires only `status = 'reviewed'` and a null
  `invoice_id` (`invoice_ledger.sql:755-760`). Filtering on `billable` produces a detector
  that never fires.
- **Unbilled materials**: `expenses` where `job_id = p_job_id and billable = true and
  status in ('reviewed','billable') and invoice_id is null` (`invoice_ledger.sql:808`).
- Labor amount: `round((duration_minutes::numeric / 60) * hourly_rate, 2)` — identical
  rounding to `invoice_ledger.sql:780`. Material amount: `total_amount`.

Functions:

1. `job_unbilled_work(p_job_id uuid) returns jsonb`
2. `job_budget_variance(p_job_id uuid) returns jsonb` — actual material/sub/misc cost against
   `jobs.estimated_material_cost`, `estimated_sub_cost`, `estimated_misc_cost`. A null
   estimate yields no finding.
3. `job_estimate_variance(p_job_id uuid) returns jsonb` — recorded hours against
   `jobs.estimated_labor_hours`.
4. `job_unassigned_records(p_business_id uuid) returns jsonb` — receipts and expenses with
   `job_id is null`.
5. `get_job_findings(p_job_id uuid) returns jsonb` — calls 1–3 and returns one array.
   **The client calls only this one.** Do not add five round trips to job open.

Before writing a receipt integrity check, read
`20260904010000_receipt_financial_hardening.sql` — line-item versus total reconciliation may
already exist. Reuse it rather than adding a second implementation.

Client work: `src/lib/jobFindings.ts` with a typed `fetchJobFindings(jobId)`; render findings
in `JobDashboardScreen` (variances), `InvoiceDraftScreen` (unbilled work — this is the
canonical case), and `ReceiptReviewScreen` (integrity). Placement is part of the entitlement:
a finding must appear wherever the fact is relevant.

Register these keys in `subscription_features` and grant them to Free in `plan_entitlements`
so they are movable later, even though the functions do not check them:
`job.snapshot.view`, `job.budget_variance.view`, `job.estimate_variance.view`,
`job.unbilled_work.detect`, `receipt.integrity_check`.

**Adding Free keys changes the asserted Free allowlist.** Update the `freeBaseline` array in
`tests/tier-boundary.test.mjs` and the `freeBaselineFeatures` set in
`src/contexts/EntitlementsContext.tsx:27` in the same commit, or CI fails.

### 13.3 Free remedy at the point of the finding

Migration `<timestamp>_add_unbilled_to_draft.sql`:

```sql
public.add_unbilled_work_to_draft(
  p_invoice_id uuid,
  p_expected_version integer,
  p_source_kind text,          -- 'labor' | 'material'
  p_source_ids uuid[],
  p_idempotency_key text
) returns jsonb
```

It must route through the existing ledger validation. Do not write `invoice_time_entries` or
`invoice_expenses` directly and do not bypass `guard_invoice_source_attribution`. Extract the
shared validation body out of `save_invoice_draft` into an internal function and call it from
both, rather than duplicating the checks.

This is **Free** — no entitlement check. It is one deterministic write against a finding the
contractor is already looking at (rulebook §2A, tiebreaker 3). Add the control to the unbilled
finding in `InvoiceDraftScreen`.

### 13.4 Pro watch — the first Pro-only deploy

New Edge Function `supabase/functions/process-watch-queue/` (`index.ts` plus `config.toml`
with `verify_jwt = true`), modeled directly on `process-tell-queue/index.ts`:

- Authorize with `x-worker-secret` against `WATCH_WORKER_SECRET ?? RECEIPT_WORKER_SECRET`
  (same shape as `process-tell-queue/index.ts:10-13`).
- Service-role client with `autoRefreshToken: false, persistSession: false`.
- For each business with an active subscription, call `service_business_has_feature(
  business_id, 'job.watch.missed_billing')` from 13.0. `business_has_feature` will raise here.
- For each job with `status = 'active'`, call `job_unbilled_work`.
- Upsert `attention_items` with `item_type = 'watch.missed_billing'`, `source_table = 'jobs'`,
  `source_id = job_id`, plus `business_id`, `owner_id` (from `jobs.owner_id`), `job_id`,
  `severity = 'warning'`, and the amount in `metadata`. The existing
  `attention_items_source_unique` constraint makes re-runs idempotent.
- Auto-resolve: when a finding clears, set `status = 'resolved'` and `resolved_at = now()`.
- **This worker must never call OpenAI.** v1 contains no inference.

Migration `<timestamp>_watch_worker.sql`:

- `cron.schedule('contracktor-process-watch-queue', '*/15 * * * *', ...)` copying the
  `net.http_post` block from `20260827090000_async_grouped_tell_submissions.sql:531` verbatim
  and changing only the function path, including the unschedule-first `do` block.
- RLS: an authenticated client must not be able to forge a `watch.%` attention item. Add a
  policy restricting those writes to `service_role`, following the policy shape in
  `20260608107000_pro_tier_boundary.sql`.
- Register `job.watch.missed_billing`, `job.watch.budget_risk`, `job.watch.invoice_ready` and
  grant them to Pro only. Do not rename `job.proactive_insights` or `automation.proactive` —
  expand first, deprecate later.
- **Kill switch**: the worker reads a single global enable flag once per invocation,
  independent of per-business entitlement resolution, so the watch can be stopped even when
  entitlement resolution is what is broken.

Ship with no plan granting the key. Enable it for one internal account through a
`business_entitlement_overrides` row before any cohort sees it.

### 13.5 Behavioral tests

Add `tests/tier-boundary.integration.mjs` and a `test:tiers:integration` script, wired into the
`database-integration` job in `.github/workflows/quality.yml` as a fourth step using the same
env block as the existing three. Assert behaviorally against the ephemeral stack:

1. Free business: `get_job_findings` returns the unbilled finding.
2. Pro business: the same finding is returned — Free detectors are not gated.
3. Free business: a direct authenticated insert into `attention_items` with
   `item_type = 'watch.missed_billing'` is rejected.
4. `service_business_has_feature('job.watch.missed_billing')` is false for Free and true for Pro.
5. `business_entitlement_snapshot` and `service_business_has_feature` are not executable by the
   `authenticated` role.
6. `consume_subscription_usage` called twice with the same idempotency key increments the
   period quantity exactly once.
7. A time entry already attributed to a finalized invoice does not appear in `job_unbilled_work`.

Do not add further source-pattern tests for this work.

### Order, and what ships when

`13.0 → 13.1 (shadow) → 13.2 → 13.3 → 13.4`, with `13.5` growing alongside each step.

13.0 through 13.3 are Free work and belong in the Free release. 13.4 is the first Pro-only
deployment and is disabled by default.

Prerequisite hygiene, before or alongside:

- `supabase/functions/extract-receipt/` is an intentionally empty directory. The function is
  retired and has been deleted from the live project; receipt extraction now runs through
  `process-receipt-queue` and `_shared/receipt-processing.ts`. Git does not track empty
  directories, so the folder will disappear on the next commit. That is expected.
- [tier-development.md](tier-development.md) still describes one shared Supabase project for
  both development and the deployed app. That is no longer true and the Free/Pro test-account
  instructions in it point at the wrong database.

## Deferred From This Roadmap

These remain important but are not part of this immediate sequence:

- online payment processor integration
- full crew onboarding/invite UX
- payroll
- scheduling
- full inventory ledger
- fuel & vehicle receipt intelligence
- shopping runs
- customer portal refinements
- QuickBooks/Xero integrations

## Roadmap Review Rule

Do not reshuffle this roadmap casually.

Change the order when implementation reveals a material dependency, security issue, data model problem, or product-learning signal. When the roadmap changes, update this file so future work has one source of truth.
