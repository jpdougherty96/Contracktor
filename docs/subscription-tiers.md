# conTRACKtor Subscription Tiers

This document defines the tier boundary. The database is the source of truth for
plan membership and feature entitlements. Product code asks for an entitlement by
feature key and never branches on a plan name.

## The boundary

> **Free records and reveals.**
>
> **Pro watches, reasons, and acts.**
>
> **Business coordinates the team.**

External shorthand:

> Free is the system of record. Pro is the system of vigilance. Business is the
> system of coordination.

Free is not crippled on purpose. Free's sacrifice is **attention**:

> **Free is one person, it answers when asked, and it does not watch your jobs
> while you are not looking.**

With Pro, conTRACKtor starts operating itself. That is what the contractor pays
for, and it is the same thing the North Star optimizes: less human attention
required to run the business accurately.

## Two axes decide every feature

**Axis 1 — proof.** Can ordinary deterministic code prove it from records the
user already entered, or does it require inference, prediction, language, or
cross-job pattern?

**Axis 2 — initiative.** Does it run because the user asked, or does it run
continuously without being asked?

|                   | On demand | Continuous |
| ----------------- | --------- | ---------- |
| **Deterministic** | Free      | Pro        |
| **Inferential**   | Pro       | Pro        |

Stated as one rule:

- **Free** = deterministic truth, plus the capture AI required to record it, on demand.
- **Pro** = continuous vigilance, inference, and delegated or ongoing administrative
  labor. Not the immediate correction of a Free finding — that stays Free.
- **Business** = multi-person participation and coordination.

The governing principle behind Free:

> If ordinary code can prove something about records the contractor already
> entered, we do not charge him to see it. **We do not charge a contractor to see
> his own math.**

## Classification test

Ask these in order. The first "yes" wins.

1. **Does it require a second authenticated person to participate?**
   Crew accounts, assignments, permissions, crew capture, oversight. → **Business**
2. **Can deterministic code prove it from records the user already entered, and
   will it be shown where that fact belongs, when the user is there?** → **Free**
3. **Otherwise → Pro.** It requires inference, prediction, or language; or it runs
   on a schedule rather than a user action; or it performs the administrative work
   a finding creates.

### Four tiebreakers

**1. Capture AI is a deliberate Free exception.** Receipt extraction is AI and is
Free, because without it capture is too slow to beat the notebook. It is an
exception to the deterministic rule, not evidence that the rule is soft.

Free AI is metered. When an allowance is exhausted:

- **Recording the receipt is never blocked.** Manual entry appears immediately, as
  the default path, not behind a dismissal. This part is constitutional.
- Saying that Pro includes more automated processing is honest and permitted, but
  only as secondary, non-modal information. It must never be a step the contractor
  has to dismiss while standing in a parking lot holding a receipt. The competitor
  is the notebook; an interstitial there is exactly the friction that loses to it.
- The message names what actually ran out — automated scanning — not the ability to
  record the receipt.

**The share of Free users who reach an AI allowance is a health metric, never a
conversion metric.** The moment it is treated as a conversion lever, the incentive
becomes lowering the cap, which taxes correctness by another route. A generous
allowance that almost nobody reaches is the target.

**2. Event-triggered attention is Free. Scheduled scanning is Pro.** An attention
item created as a direct consequence of a write the user just made — a receipt
that could not be extracted, a receipt with no destination, a Tell submission that
could not be committed — is Free, and is how `attention_items` already works. A
job scanned nightly that nobody touched is Pro. The line is: *conTRACKtor could
not finish what you started* (Free) versus *conTRACKtor went looking on your
behalf* (Pro).

**3. A single deterministic remedy at the point of the finding is Free.** If
conTRACKtor shows the contractor that six recorded hours are missing from the
invoice he is currently looking at, adding them is one deterministic write and
belongs in Free. Making him retype what the app just computed is punitive. Pro
owns the unprompted finding, the batch fix, drafted language, and any remedy
requiring judgment.

**4. Placement is part of the entitlement.** A Free finding must appear everywhere
the fact is relevant, not on one obscure screen. Weakening Free by placement is
the same violation as weakening it by entitlement, and it is harder to detect.

## The canonical case

Johnson has six recorded billable hours that are not on any invoice.

- **Free**, when the contractor opens or prepares that invoice:
  `6 recorded hours are not included on this invoice — $510`, with a control to add them.
- **Pro**, unprompted, across every active job:
  `Possible $510 missed billing on Johnson. Six billable hours have not reached an
  invoice.` With the corrected draft prepared, and eventually Saved · Undo once the
  action is proven safe.
- **Business**: the same, plus who recorded the hours, and owner review of
  crew-submitted time before it bills.

The fact is never premium. The vigilance, the interpretation, and the labor are.

## Why the ladder compounds

These are not three SKUs. Each tier makes the next one more valuable:

- Free accumulates trustworthy job history, because it is genuinely useful and
  costs nothing to keep using.
- That history is what makes Pro worth paying for. A watch over three weeks of
  records is a novelty; a watch over three years of records catches things the
  contractor cannot hold in his head.
- Business adds contributors, which increases both the volume and the fidelity of
  truth entering the system, which makes the Pro layer better again for the same
  business.

> more records → better intelligence → more reliance → more participants → more records

This is the strategic thesis, not a measured effect. Argue it as reasoning; never
present it as demonstrated until retention and conversion data exist.

---

## conTRACKtor Free

> **Capture the complete truth of the job, and see anything conTRACKtor can prove
> from that record.**

Free must be sufficient to run the factual record of a small contracting business
without hitting walls.

### Records and capture

- jobs, customers, job states, fixed-bid and time-and-materials
- hours: timer, manual entry, hours by job, labor cost
- receipts: capture, original image preserved, AI extraction, correction,
  line items, discounts, rebates, store credits, job assignment
- manual expenses
- payments ledger, deposits, balances
- notes, photos, durable chronological job history
- shopping needs, including Tell-generated items
- job tasks

### Deterministic reveal

Anything code can prove from the above, shown where it belongs:

- job financials and deterministic Job Snapshot
- budget variance (`Job is $1,200 over its material budget`)
- estimate variance (`Actual labor is 86 hours against an 80-hour estimate`)
- receipt integrity (`Line items total $412 but the receipt total is $431`)
- unbilled work detection at the invoice (`6 recorded hours are not on this invoice`)
- unassigned or unresolved records (`Three receipts have no destination`)
- stale open tasks (`Open 47 days`)
- Activity, and required Needs Attention generated by the user's own writes

### Use of the record

- build an invoice from the job record, save and share a PDF
- basic job reports
- export job records

Never paywall a user's exit. Exports and invoices stay Free permanently.

### Tell conTRACKtor — Free

Free Tell turns what the contractor says into records:

> "Worked 7 hours on Johnson, moved the outlet, and need four sheets of drywall."

→ proposed hours, note, and shopping items, reviewed and approved by the human.

Free Tell creates and retrieves. It does not reason across the business.

### What Free deliberately gives up

- it is one person
- it answers when asked; it does not monitor
- it reports what is true; it does not predict, judge, or interpret
- it does not do the administrative work that a finding creates
- its AI usage is capped, and degrades to manual capture rather than to a paywall

---

## conTRACKtor Pro

> **conTRACKtor starts working on the record for you.**

Pro sells three things, in this order:

**1. Watch for me.** Free requires the contractor to open the job, invoice, or
report. Pro watches continuously and surfaces what it finds before he thinks to
look. The underlying fact did not become premium — the vigilance did.

**2. Think about it for me.** Free says `Estimate 80 hours, actual 86, +6`. Pro
says `Labor is running ahead of plan; Johnson may finish roughly 14 hours over
estimate.` Free says `The outlet relocation added 7 recorded hours.` Pro says
`That work appears outside the original scope and may be unbilled change work.`

**3. Do something about it for me.** Free identifies. Pro prepares the corrected
draft, writes the description, batches the fixes, and eventually acts under
Saved · Undo for actions proven safe.

### The three launch features

Build these three and nothing else until they are proven to convert.

1. **Missed Money Watch** — continuous scanning of every active job for work
   recorded but not billed, with the fix prepared. Flagship. Sells itself: *"If it
   finds $500 once, the subscription is trivial."* Implementation note: the
   deterministic detectors belong to Free and are built once as reusable
   server-side functions; Pro is the scheduler, the notification, and the remedy on
   top of them. This makes the flagship cheap to build.
2. **Automatic receipt handling** — Free is capture → extract → review → assign →
   approve. Pro moves toward capture → handled, with the contractor intervening
   only on exceptions. This directly buys back attention.
3. **Ask the job** — `How is Johnson looking?` Cross-record conversational
   retrieval and interpretation across money, labor, materials, progress, changes,
   and recent history.

### Also Pro, as they are built

Proactive budget and margin risk, projected final cost, scope-impact analysis,
invoice-readiness checks, cross-job and historical estimating intelligence,
duplicate detection, learned allocation, higher AI allowances, persistent Tell
conversations, and voice.

### What Pro is not

Pro is not a usage allowance. Higher limits come with Pro, but capability is the
reason to buy it. A tier that is only a quota is a tax, not a product.

---

## conTRACKtor Business

> **The whole crew contributes to one trustworthy record.**

Business includes everything in Pro, plus:

- team accounts: owner, admin, crew, future office roles
- job assignment, assignment history, crew scoped to relevant jobs
- crew time tracking against real authenticated users, with owner review
- crew capture: notes, photos, receipts, hours, tasks, shopping, within permissions
- permissions: crew do not see company-wide profit, unrelated jobs, or owner finances
- owner oversight: who recorded what, pending submissions, cross-worker activity
- crew-aware Tell: *"Mike and I worked 8 hours at Johnson"*, *"Who is still clocked in?"*

### Business model

Business is priced as **base subscription plus seats**, not as a flat tier. A
20-person contractor should not generate the same revenue as a 2-person contractor
when both the value and the infrastructure footprint scale with the crew.

Two domain constraints on the seat model:

- **Bill active seats.** Contractor crews are seasonal and churn hard. A rigid
  seat count gets cancelled in November.
- **Owner and admin are included in the base**; crew are the metered unit.

Exact prices remain unset pending competitor research and unit economics. Business
also depends on the multi-user ownership and RLS work gated in
`technical-foundations-roadmap.md`, so it is further out than its feature list
suggests.

---

## Feature key catalogue

Keys name a capability precisely. **There are no `basic` and `advanced` variants**
— the entitlement system is binary, so a fuzzy boundary becomes an arbitrary one
decided differently by whoever writes each feature. Split the capability into two
named keys instead.

Naming: `domain.subject.verb`, lowercase, dot-separated, stable forever once
shipped.

### Capability and quantity are separate

`enabled` is capability. `limit_value` is quantity. They are already different
columns on `plan_entitlements`, so a Free allowance can change without changing
what Free *means*, and a per-business override can raise one limit without
granting a new capability.

Do not create allowance keys such as `tell.monthly_allowance`. Put the number on
`limit_value` for `tell.basic`, which is what `getFeatureLimit()` exists to read.
That function is currently dead code; wiring it up is part of the metering release
gate.

### Shipped today

| Key | Tier |
| --- | --- |
| `core.jobs`, `core.job_financials`, `core.hours`, `core.time_clock` | Free |
| `core.receipts`, `core.receipt_extraction`, `core.expenses` | Free |
| `core.payments`, `core.notes_photos`, `core.invoices_reports` | Free |
| `core.shopping`, `activity.feed`, `tell.basic` | Free |
| `receipt.smart_allocation`, `snapshot.ai_insights` | Pro |
| `job.proactive_insights`, `activity.business_feed` | Pro |
| `tell.conversation`, `tell.voice`, `tell.job_memory`, `tell.job_questions` | Pro (declared, unshipped) |
| `tell.global`, `tell.job_creation`, `automation.proactive` | Pro (declared, unshipped) |

### Proposed additions

Free — deterministic reveal:

```txt
job.snapshot.view
job.budget_variance.view
job.estimate_variance.view
job.unbilled_work.detect
receipt.integrity_check
```

Pro — vigilance, inference, remediation:

```txt
job.watch.missed_billing
job.watch.budget_risk
job.watch.invoice_ready
job.projection.final_cost
job.analysis.scope_impact
invoice.missing_items.prepare
receipt.allocation.auto
tell.cross_record_query
```

Business — coordination:

```txt
team.members
team.roles
team.job_assignment
team.crew_capture
team.time_clock
team.oversight
tell.team_context
```

`job.proactive_insights` and `automation.proactive` are umbrella placeholders.
Split them into the specific `job.watch.*` keys as each watch is built. Following
the expand-first rule, existing keys stay live and new keys are added alongside
them; nothing is renamed or dropped while a deployed client still reads it.

---

## Pricing

Pro launch hypothesis remains **$19/month or $190/year**. With Missed Money Watch
as the flagship, the value case likely supports more; do not anchor publicly until
real conversion and savings data exist. There is no permanent founding-price
promise.

Usage limits are set only after observing Tell usage, receipt volume, AI cost per
active user, conversion, and demonstrated savings.

## Shared product infrastructure

Security, data ownership, durable processing, auditability, migrations, and other
integrity foundations are not paid features. A plan may control a user-facing
capability, but it must never weaken data protection or the reliability of an
existing Free workflow.

## Data model

- `subscription_plans` — Free, Pro, Business, and internal plans
- `subscription_features` — stable feature keys understood by product code
- `plan_entitlements` — whether a plan has a feature, plus limits and configuration
- `business_subscriptions` — the plan assigned to each business
- `business_entitlement_overrides` — per-business exceptions and kill switches
- `subscription_usage` — period counters for fair-use enforcement

`get_my_entitlements` resolves the effective snapshot: read the assigned plan, read
every active feature's plan entitlement, apply any unexpired override, return one
JSON snapshot. An override wins over the plan for `enabled`, and for `limit_value`
when `has_limit_override` is true. Override `config` merges over plan `config`.

## Product-code rule

```ts
const entitlements = await fetchBusinessEntitlements();

if (isFeatureEnabled(entitlements, 'job.watch.missed_billing')) {
  // Pro vigilance.
}
```

Never branch on a plan name. Features must be able to move between plans without
a code change.

## Change control

These lists are a starting allocation, not a permanent promise. Individual features
can move between plans through entitlements. What cannot change silently is the
promise that Free stays usable, and that deterministic truth about a contractor's
own records is never paywalled.
