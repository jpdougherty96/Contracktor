# conTRACKtor Development Roadmap

This roadmap turns the Product Rulebook into a practical build sequence. It is intentionally iterative: implementation discoveries can change details, but changes to the sequence should be explicit and justified.

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

All roadmap work ships from one codebase. The version deployed from `main`
before Pro development is the protected Free baseline. Pro work must remain
behind runtime entitlements until release, and a broken or unavailable Pro
capability must not prevent a business from completing a Free workflow.

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

Goal: preserve the production-`main` baseline as Free while allowing new
features to move dynamically between Free, Pro, and future plans.

Implementation direction:

- Plans, features, plan entitlements, business assignments, and business overrides live in the database.
- Existing and new businesses default to Free.
- The production-`main` baseline remains enabled in Free.
- Activity, Shopping, smart receipt allocation, and Tell conTRACKtor begin in
  Pro because they were added after that baseline.
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
