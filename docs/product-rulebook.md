# conTRACKtor Product Rulebook

This rulebook governs product design, UX, AI behavior, workflow design, and user-facing architecture in conTRACKtor. It is the product constitution, not a static artifact. Update it as the product gets sharper.

Before implementing or materially changing any user-facing workflow, evaluate the change against this rulebook. If a change violates a rule, identify the violation before coding and explain why the exception is necessary.

The README describes what exists today. This rulebook defines how future product decisions should be evaluated.

## 0. Iteration Rule

The rulebook is binding, but not permanent.

When product evidence, implementation work, or real usage shows that a rule is wrong, incomplete, too absolute, or causing unnecessary friction, update the rulebook instead of silently working around it.

Workflow changes should do one of three things:

- follow the rulebook
- explicitly justify a temporary exception
- improve the rulebook itself

The goal is not to preserve old decisions. The goal is to preserve the product philosophy while learning from real use.

Build reversible foundations. Prefer small, composable changes that let conTRACKtor learn and evolve:

- feature flags where useful
- clear status fields
- audit trails
- source preservation
- correction paths
- idempotent processing
- separable capability functions
- schemas that support future business/team ownership

The rulebook is a living constitution, not a museum piece.

## 0A. Free Baseline Compatibility

The product deployed from `main` before Pro development began is the protected
Free baseline. New work may be assigned to Pro, but it must not make an existing
Free workflow unavailable, less reliable, or dependent on a paid service.

Apply these rules to every tiered change:

- maintain one codebase and resolve access through feature entitlements
- default authenticated businesses to Free
- let the client fall back to known Free capabilities when entitlement lookup
  is unavailable
- enforce paid access again at the database or server boundary
- fail closed for paid AI usage and paid data mutations
- keep security, permissions, ownership, durability, auditability, and data
  integrity shared across every plan
- preserve read/export access to historical records after downgrade
- use expand-first migrations so the currently deployed client remains usable
  while a new release is being introduced

A tier definition can change. The promise that Free remains usable cannot be
silently changed.

## 1. North Star

Users capture or describe reality. conTRACKtor turns it into records.

The user should provide the minimum amount of raw truth necessary. conTRACKtor should perform as much administrative work as it safely can.

Core objective:

```txt
Minimize the amount of human attention required to accurately run the business.
```

This includes reducing:

- taps
- screens
- typing
- decisions
- waiting
- repeated entry
- required review
- remembering
- administrative interpretation

Tap count matters, but attention matters more. A three-tap workflow requiring five seconds of attention can be better than a one-tap workflow that makes the user watch a spinner for thirty seconds.

## 2. Product Scope

conTRACKtor is not trying to recreate every function of QuickBooks, Xero, ServiceTitan, payroll software, generic CRM software, or enterprise project management software.

Its job is to make operating a small contracting business dramatically easier.

The active MVP boundary is defined in [mvp-definition.md](mvp-definition.md).
Until that finish line is met, the governing scope test is:

```txt
Does this help conTRACKtor capture reality, organize reality,
or explain the financial reality of a job?
```

The MVP core loop is:

```txt
Job
-> Labor, receipts, notes, and shopping needs
-> Organized job history
-> Basic financial picture
```

Invoices and the existing payments ledger may support the loop, but they do not
expand the MVP into accounting, CRM, scheduling, payroll, fleet, or project
management software. Features outside the MVP loop are deferred by default.

## 2A. Pricing Principle

The tier boundary follows one durable rule:

> **Free records and reveals.**
>
> **Pro watches, reasons, and acts.**
>
> **Business coordinates the team.**

Two axes classify every capability.

**Proof.** Can ordinary deterministic code prove it from records the user already
entered, or does it require inference, prediction, language, or cross-job pattern?

**Initiative.** Does it run because the user asked, or continuously without being
asked?

```txt
                 On demand    Continuous
Deterministic    Free         Pro
Inferential      Pro          Pro
```

- **Free** = deterministic truth, plus the capture AI required to record it, on demand.
- **Pro** = continuous vigilance, inference, and delegated or ongoing administrative
  labor — not the immediate correction of a Free finding.
- **Business** = multi-person participation and coordination.

Classify a proposed capability with these questions, first yes wins:

1. Does it require a second authenticated person to participate? It belongs in Business.
2. Can deterministic code prove it from records the user already entered, and will
   it be shown where that fact belongs, when the user is there? It belongs in Free.
3. Otherwise it belongs in Pro: it infers, predicts, or interprets; it runs on a
   schedule rather than a user action; or it performs the administrative work a
   finding creates.

Correctness always wins the classification. Extraction and reconciliation of
discounts, rebates, store credit, tax, payment totals, corrections, and required
attention cannot become premium merely because AI helps produce the accurate
record.

> **We do not charge a contractor to see his own math.**

Four tiebreakers resolve the hard cases:

- **Capture AI is a deliberate Free exception.** Receipt extraction is AI and is
  Free, because capture must beat the notebook. Free AI is metered, and an
  exhausted allowance must never block recording the receipt: manual entry is the
  immediate default, not something behind a dismissal. Naming Pro's additional
  automation is permitted, but only as secondary, non-modal information off the
  critical path. The share of Free users reaching an allowance is a health metric,
  never a conversion metric.
- **Event-triggered attention is Free; scheduled scanning is Pro.** An attention
  item raised because conTRACKtor could not finish what the user started is Free.
  Scanning jobs nobody touched, on conTRACKtor's own initiative, is Pro.
- **A single deterministic remedy at the point of the finding is Free.** If the
  product shows the contractor that six recorded hours are missing from the invoice
  in front of him, adding them is Free. Pro owns the unprompted finding, the batch
  fix, drafted language, and any remedy requiring judgment.
- **Placement is part of the entitlement.** A Free finding must appear everywhere
  the fact is relevant. Weakening Free by placement is the same violation as
  weakening it by entitlement.

Free's sacrifice is attention, and it is stated plainly rather than hidden:

> Free is one person, it answers when asked, and it does not watch your jobs while
> you are not looking.

Entitlement keys name capabilities exactly. There are no `basic` and `advanced`
variants; a fuzzy boundary becomes an arbitrary one. See
[subscription-tiers.md](subscription-tiers.md) for the boundary, the canonical
missed-billing example, and the feature key catalogue.

## 3. Rule Priority

When rules conflict, resolve them in this order:

1. Safety, legality, security, permissions, and financial integrity
2. Prevent loss or corruption of user data
3. Preserve truth, auditability, and recoverability
4. Respect explicit user intent
5. Minimize human attention
6. Minimize required decisions
7. Minimize typing
8. Minimize taps and screens
9. Maintain visual and architectural consistency

A lower-priority objective must not override a higher-priority requirement. Convenience is extremely important, but convenience does not justify unsafe financial actions, lost data, invented facts, or unauthorized changes.

## 4. AI-First Delegation

Before asking a human to do administrative work, ask whether conTRACKtor can safely do it instead.

AI and automation may help with:

- extraction
- transcription
- classification
- categorization
- matching
- identifying inputs and relationships needed for calculations
- identifying likely reconciliation issues
- data lookup
- defaults
- routing
- summarization
- invoice preparation
- message drafting
- estimate descriptions
- job summaries
- anomaly detection
- identifying missing information
- preparing follow-up actions
- determining likely next actions
- background processing

The default implementation question should be:

```txt
Why is a human doing this?
```

If the answer is merely "because the form needs the field," that is not sufficient.

AI may never read, infer from, disclose, or act upon information beyond the permissions of the user on whose behalf it is operating.

## 5. AI Belongs Inside The Product

AI should not primarily exist as a separate chatbot or isolated feature. AI belongs inside workflows.

Where useful, conTRACKtor should automatically provide AI with the relevant context already available in the application. Never make the user explain conTRACKtor's own data back to its AI.

If the user is on the Johnson job, AI should already know Johnson is the likely context.

AI should appear through outcomes:

- receipt automatically understood
- likely job automatically selected
- invoice description already drafted
- customer reminder already prepared
- job financial position summarized
- relevant warning surfaced
- voice command converted into records

The user does not need to know which model, prompt, or internal AI process created the result.

## 6. Natural Language Is A Control Surface

The user should be able to tell conTRACKtor what they want done in normal language. conTRACKtor should use app context, permissions, and available capabilities to complete as much of the request as safely possible.

The user should not have to navigate to the correct screen, choose the correct record type, or translate intent into app categories when conTRACKtor can infer it.

Examples:

```txt
"Add 8 more 2x4s to the Benson shopping list."
-> Creates a shopping need.

"Show me everything we need from Lowe's."
-> Shows a combined shopping list across relevant open jobs.

"Joe worked 7 hours on Miller today."
-> Creates or prepares a time entry if permitted.

"Send Johnson the final invoice."
-> Prepares the invoice/send screen; user confirms Send.
```

Low-risk reversible work may be completed with Undo. Consequential actions require approval.

## 7. Code Capabilities, Not Every Workflow

Do not hard-code a unique AI workflow for every sentence a user might say or every combination of actions.

Instead, expose safe, permission-aware business capabilities that AI can use. Exact implementation may differ, but the conceptual capability layer should include actions like:

- read jobs
- read job financials
- search customers
- prepare time entry
- create time entry
- prepare expense
- create expense
- assign receipt
- create note
- attach photo
- create shopping need
- update shopping need
- prepare invoice
- send invoice
- prepare customer message
- prepare manual payment
- commit manual payment
- prepare job status change
- commit job status change
- get balance due

Principle:

```txt
We code capabilities. AI composes capabilities into workflows.
```

AI must never receive unrestricted database authority simply to gain flexibility. Safe application-level actions remain the boundary around what AI may change.

Service credentials are infrastructure, not authorization. Any server-side or background action that bypasses RLS must explicitly validate business scope, initiating user, current membership/role, and action permission before reading or committing protected data.

## 8. AI May Discover Work

AI should not be limited to explicit AI commands. conTRACKtor may use AI to inspect relevant application events and discover useful administrative work or important situations.

Examples:

```txt
Job marked complete
-> balance remains
-> no final invoice exists
-> suggest or prepare final invoice

Invoice becomes overdue
-> no payment pending
-> prepare a reminder

Receipt processed
-> likely Johnson job based on assignment/history/context
-> classify automatically if safe
```

Discovery does not imply authority. AI may observe, analyze, identify, summarize, prepare, and recommend. Authority to commit an action depends on permission, consequence, confidence, and reversibility.

## 9. Automation And Supervision Model

AI autonomy depends on both confidence and consequence. Confidence alone is not enough.

Automation confidence must be grounded in evidence and validation signals, not solely in a model's self-reported confidence. Useful signals may include source quality, deterministic reconciliation, matching context, role permissions, correction history, and whether required fields were independently verified.

Consequence should be evaluated consistently across features based on factors such as financial magnitude, number of affected records, reversibility, external visibility, user role, abnormality, and audit risk. Avoid letting every feature invent unrelated thresholds or policies.

### Level 1: Low-Risk Reversible Internal Actions

Examples:

- routine, in-policy time entry
- note
- shopping need
- categorization
- vendor match
- receipt classification
- high-confidence job assignment
- internal tagging
- extraction

Default behavior:

```txt
Act automatically when sufficiently confident.
Show Saved · Undo.
```

### Level 2: Consequential But Preparatory Actions

Examples:

- invoice preparation
- customer-message drafting
- payment reminder drafting
- job-completion preparation
- change-order preparation
- significant financial adjustment proposal

Default behavior:

```txt
AI does the work. Human reviews or approves the consequence.
```

The human should supervise the decision, not manually perform all preparation.

### Level 3: High-Consequence External Or Financial Actions

Examples:

- actually charging a customer
- issuing refunds
- changing payout bank account
- sending unusual or legally meaningful communications
- deleting important source data
- major bulk edits
- destructive permission changes

Require explicit intent and appropriate confirmation. AI may prepare the work but must not silently execute these actions.

## 10. Capture First, Classify Later

Do not force users to choose database categories before capturing what happened unless technically, legally, or financially necessary.

A contractor holding a receipt should not have to navigate:

```txt
Home
-> Add expense
-> Choose job
-> Receipt/manual
-> Add receipt
-> Camera
```

Target:

```txt
Home
-> Capture receipt
```

Then conTRACKtor handles upload, extraction, classification, reconciliation, job matching, and saving.

Classification should occur after capture whenever possible.

## 11. One Tap To Common Actions

Anything performed frequently should be directly accessible.

Examples:

- Capture receipt
- Tell conTRACKtor
- Start/stop work
- Active jobs
- Needs Attention

For extremely common actions, one tap plus capture or speech should ideally be the entire user contribution.

## 12. Never Ask Twice

If conTRACKtor knows or can safely infer information, do not ask the user for it again.

Potential context includes:

- logged-in user
- business
- current screen
- assigned job
- recent job
- active timer
- date
- worker
- stored worker rate
- customer
- vendor history
- previous corrections
- invoice recipient
- contract amount
- balance due
- recent activity
- permitted location context

Do not make the user maintain data that already exists elsewhere in conTRACKtor.

## 13. Infer Before Asking

Use context before presenting choices. The smarter the system becomes, the less the user should need to specify.

Example:

```txt
Crew member assigned only to Johnson today says:
"Eight and a half hours today."

conTRACKtor may already know worker, business, date, likely job, and rate.
```

## 14. Ask Only For The Missing Piece

If conTRACKtor knows five of six required facts, ask for fact six.

Bad:

```txt
Display an entire expense form because job assignment is uncertain.
```

Good:

```txt
$86.42 · Menards
Which job?
[Johnson] [Smith] [Tools / Inventory]
```

Do not convert uncertainty in one field into a full manual workflow.

## 15. Forms Are Fallback UI

Forms remain necessary. They are not the preferred interaction model.

Forms should handle:

- unusual cases
- corrections
- manual entry
- low-confidence situations
- advanced edits
- users who prefer direct entry

Capture, speech, defaults, and inference should handle routine workflows whenever practical.

## 16. Structured Data Does Not Require Structured Data Entry

conTRACKtor should preserve structured data because structured data makes the app reliable, searchable, auditable, and useful.

But users should not have to create that structure manually when conTRACKtor can derive it from speech, notes, receipts, photos, job context, or prior activity.

Example:

```txt
Original note:
"We need 8 more 2x4s for the Benson remodel."

Derived structure:
shopping_need
- job: Benson
- quantity: 8
- item: 2x4s
- status: open
- source: original note
```

The original human input must remain preserved separately from AI-derived structure.

## 16.5. One Source May Contain Multiple Financial Meanings

Do not force a captured source into one database category when the source clearly contains multiple kinds of business records.

Examples:

```txt
Gas station receipt:
- diesel fuel
- drink/snack

Hardware receipt:
- Johnson plumbing fittings
- Miller deck screws
- shop blades
```

conTRACKtor should extract and preserve the source once, then represent the meaningful portions separately when useful.

For fuel receipts, conTRACKtor should eventually identify fuel-specific facts such as gallons, fuel type, price per gallon, fuel amount, and station/location, while separating non-fuel purchases instead of treating the whole receipt as fuel.

AI may interpret what portions are likely to mean. Deterministic code should reconcile totals, taxes, discounts, and generated financial records. If the split is uncertain or consequential, ask only for the missing decision.

## 17. Prefer Correction Over Confirmation

For low-risk reversible actions:

```txt
Saved · Undo
```

is preferable to:

```txt
Review
-> Confirm
-> Save
```

Mandatory confirmation should be reserved for situations where consequences are meaningful, reversal is difficult, money moves, external communication occurs, data is destructive, or legal significance exists.

## 18. Review Is An Exception State

Review should not be part of every happy path.

Use review when:

- confidence is low
- totals fail reconciliation
- duplicate is possible
- multi-job or multi-destination allocation has uncertainty or consequence that justifies review
- job/customer match is ambiguous
- receipt is unusual
- financial result is materially surprising
- payment failed/reversed/disputed
- owner approval is required
- user intent is unclear

Do not require review simply because AI was involved.

## 19. Every Tap Must Earn Its Place

For every screen, button, field, confirmation, prompt, dropdown, and navigation step, ask:

```txt
What goes wrong if this is removed?
```

"The data model is cleaner this way" is not a sufficient UX justification.

## 20. Do Not Expose Implementation Concepts

Users should interact using contractor language.

Good:

- Capture receipt
- Start work
- Tell conTRACKtor
- Get paid
- Needs attention
- Saved
- Processing

Avoid exposing internal concepts as primary UX:

- time_entries
- customer_payments
- extraction_jobs
- storage_objects
- Stripe Connect
- processor IDs
- database categories

The implementation serves the workflow, not the reverse.

## 21. Optimize The Common Successful Path

Optimize aggressively for the most common successful workflow without making uncommon valid workflows impossible.

Complexity should reveal itself only when necessary. Do not design every happy path around rare exceptions.

## 22. Background Processing

Never make the user wait for processing that can safely happen without them.

For long-running work:

1. Accept the user's input.
2. Persist source material durably.
3. Confirm that the input is secured.
4. Let the user leave.
5. Process server-side.
6. Save the result.
7. Surface it naturally when complete.
8. Request attention only if necessary.

Receipt target:

```txt
Open
-> Camera
-> Capture
-> Receipt secured
-> user puts phone away
```

Everything after "Receipt secured" is conTRACKtor's responsibility.

Potential background work includes:

- receipt extraction
- reconciliation
- job matching
- report generation
- invoice generation
- imports
- AI analysis
- document processing
- payment webhook reconciliation

## 23. Source Preservation

Never lose captured truth.

Before AI transformation, preserve the original input whenever practical.

Examples:

- receipt image
- uploaded document
- original photograph
- original voice transcript/audio where appropriate
- original user text

Generated records should remain traceable to their source.

Processing should be retryable, idempotent, and recoverable. Duplicate processing must not create duplicate financial records. Failures must become actionable states, not disappear silently.

Every retryable processing stage and every consequential commit must have a stable idempotency boundary. This applies beyond extraction: retries must not duplicate expenses, Activity events, shopping-need fulfillments, payments, or other downstream records.

Preserve source material when it materially supports auditability or recovery, but do not retain sensitive raw source data longer than necessary. Retention must be intentional, disclosed where appropriate, and appropriate to the source type.

## 24. Connectivity And Offline Behavior

Assume contractors will use conTRACKtor in basements, rural areas, metal buildings, weak cellular networks, and intermittent connectivity.

Whenever practical:

- preserve captured input locally
- retry uploads automatically
- allow queued uploads
- avoid losing input because a network call failed

Clearly distinguish:

- Saved on device
- Uploading
- Secured
- Processing
- Needs attention
- Complete

Never claim an item is secured remotely until the server actually has durable source data. If offline support stores the source only on-device, say so.

## 25. Activity, Needs Attention, And Notification Discipline

Automation should create visibility, not approval work.

Use two primary UX states:

```txt
Activity
conTRACKtor completed something. No action required.

Needs Attention
conTRACKtor cannot safely finish without human input.
```

At the data-model level, keep immutable history separate from actionable state:

```txt
activity_events
= immutable history of what happened

attention_items
= actionable state such as open, resolved, or dismissed
```

They may reference each other and appear together in the product, but resolving an attention item must not erase the historical activity event.

Activity can include badges or visual weight:

```txt
Normal
Completed, no action needed.

Review recommended
Completed, but worth a look because of amount, crew source, split receipt, or unusual assignment.

Needs attention
Not completed. Human input required.
```

Do not make owners approve normal work one card at a time. If everything looks reasonable, the owner should be able to do nothing.

Attribution matters:

```txt
Joe captured $57.42 at Lowe's.
conTRACKtor assigned it to Benson.
```

This is better than:

```txt
Joe added $57.42 to Benson.
```

unless Joe actually made the assignment.

Successful routine work should usually appear quietly in Activity. Notify only when attention is actually valuable, such as action required, meaningful failure, payment state change, important deadline, significant customer event, or unusual financial situation.

## 26. Different Users Need Different Products

conTRACKtor may serve:

- Owner
- Office/Admin
- Crew
- Customer

Do not give every user the entire application.

Owner needs visibility and control over the business.

Office/Admin needs operational tools without unnecessary owner-only settings.

Crew needs the fastest possible interface for capturing work:

```txt
Open
-> speak/capture/timer
-> done
```

Customer needs to understand who they are dealing with, what is owed, what the invoice represents, how to pay, and what happens next.

## 27. Never Transfer Contractor Convenience Into Customer Friction

Do not simplify the contractor's workflow by making the customer's experience unnecessarily difficult.

Examples:

- Do not require customer account creation merely to pay.
- Do not ask customers to re-enter known information.
- Do not make customers understand conTRACKtor architecture.
- Give customers reasonable payment choice when appropriate.
- Make contractor identity obvious.
- Make payment status and amount clear.
- Minimize customer typing and navigation.

## 28. Receipt Rules

Target happy path:

```txt
Capture
-> secured
-> background extraction
-> background reconciliation
-> likely job determined
-> auto-save or prepare split based on consequence
-> quiet confirmation
```

Ask for help only when necessary:

- multiple likely jobs
- split purchase
- rebate ambiguity
- duplicate possibility
- unreconciled total
- poor image
- Tools / Inventory ambiguity

Job selection should generally happen after capture rather than before it. If capture begins from a specific job screen, preserve that job as scan context.

## 29. Multi-Destination Receipt Rules

AI should reduce line-by-line assignment work, not create a new review chore.

For receipts spanning multiple jobs or inventory:

1. AI interprets receipt lines and likely destinations.
2. AI reasons in groups where possible.
3. Deterministic code calculates tax, discounts, rebates, totals, and reconciliation.
4. The user reviews only uncertainty or consequence that justifies review.

Rule:

```txt
AI interprets. Code calculates.
```

Resolve ambiguity at the highest useful level. Do not ask line-by-line questions when items can confidently be resolved as a group.

Initial default for multi-destination receipts:

```txt
AI prepares the split.
User approves or corrects the meaningful uncertainty.
```

Over time, if confidence and correction history justify it, high-confidence splits may move toward completed Activity with Undo or Change.

## 30. Shopping Need Rules

A shopping need is structured state, not just note text.

The user should be able to create shopping needs naturally:

```txt
"We need 8 more 2x4s for the Benson remodel."
```

conTRACKtor should preserve the original note or transcript, then derive open shopping needs linked to the relevant job.

Shopping needs should be:

- saveable
- visible
- checkable
- dismissible
- traceable to source
- usable as context for receipt allocation
- capable of being fulfilled by receipt lines

For v1, shopping lists are job-level needs and combined views across jobs. Avoid building full shopping runs or warehouse inventory until the product clearly needs them.

Combined shopping lists should be generated from open shopping needs across selected or active jobs.

## 31. Hours And Crew Rules

Every active job supports both a running timer and manual labor entry. Contractors choose whether
to use the timer; job setup does not ask them to enable the capability. Non-active jobs cannot
start a new timer.

For crew:

- logged-in worker is known
- today is the default date
- assigned/current job should be inferred
- stored labor rate should be reused
- unnecessary financial information should remain hidden

Voice should be capable of expressing normal human descriptions:

```txt
"Mike and I worked eight hours on Johnson today."
```

conTRACKtor should translate that into appropriate structured work rather than store it merely as a note.

## 32. Invoice Rules

Do not begin invoice creation with a blank form if conTRACKtor already knows the job.

By invoice time, conTRACKtor may already know customer, job, contract amount, approved changes, expenses, labor, previous payments, balance, dates, and job description.

AI should assist in preparing invoice description, line-item summaries, customer-facing explanation, and amount/status validation.

Financial truth should come from structured conTRACKtor data. AI may explain and present those facts but must not invent amounts.

Consequential send action remains supervised.

Target:

```txt
Final invoice ready
$6,840

[Send] [Edit]
```

## 33. Customer Communication Rules

AI should reduce the burden of routine customer communication.

Examples:

- payment reminder
- scheduling message
- job completion message
- invoice explanation
- estimate follow-up
- change-order explanation

AI should use existing application context so the user does not retype customer name, job, amount, due date, or contractor information.

AI preparation may be automatic. External sending requires appropriate user intent.

## 34. Get Paid Rules

"Get Paid" is the user-facing product concept. Payment processor plumbing should remain secondary.

The payment workflow should connect naturally to the job:

```txt
Job
-> Invoice
-> Customer payment
-> Verified payment
-> Job balance updates
```

Do not require the contractor to separately create a payment request when sending an invoice if conTRACKtor can do both automatically.

Automatic payment status must come from processor-confirmed events or webhooks. Do not mark a payment complete solely because a customer browser returned to a success page.

Manual payments and processor-confirmed payments must remain distinguishable.

## 35. Auditability

The more work AI performs automatically, the more important traceability becomes.

Important automated actions should be explainable.

Where appropriate preserve:

- who initiated the source action
- who or what performed the derived action
- which business/user owns it
- original source
- whether AI participated
- inferred fields
- confidence/result
- later correction
- timestamps
- processing status

Product requirement:

```txt
Automated work must be recoverable, traceable, and correctable.
```

Attribution should distinguish initiation from performance. A useful conceptual model is:

```txt
initiated_by_user_id
performed_by_type = user | system
performed_by_user_id = nullable
source_type
source_id
```

Exact field names may vary, but "Joe captured the receipt" and "conTRACKtor assigned the receipt" are different facts and must remain distinguishable.

## 36. Learning From Corrections

When practical and privacy-appropriate, repeated user corrections should improve future defaults and matching.

Examples:

- Menards purchases repeatedly corrected to Tools / Inventory
- certain vendor normally belongs to one job
- user consistently changes invoice tone
- crew member normally works one assigned job

Do not create hidden behavior that becomes impossible to understand or correct.

Learning should reduce future work.

## 37. AI Cost And Deterministic Work

Use AI only where it removes meaningful user work.

Do not call AI when deterministic code is enough.

Rules:

- Keep prompts scoped to the smallest relevant context.
- Cache or store AI outputs so the same source is not reprocessed repeatedly.
- Use the least expensive processing approach that reliably achieves the required quality and safety.
- Use deterministic code for math, totals, tax, permissions, idempotency, and final writes.
- Treat AI outputs as interpretation, not financial truth.

## 38. Anti-Patterns

Do not:

- add a screen merely to choose which database record will be created
- ask users to re-enter known information
- force classification before capture when it can happen afterward
- require Save after a successful low-risk reversible operation without a reason
- trap the user on a spinner
- block navigation while safe server work continues
- display a full form because one value is unknown
- make the user monitor background processing
- expose backend states unnecessarily
- notify users every time automation succeeds
- hide failures
- discard source material after AI extraction
- silently invent financial facts
- allow unrestricted AI database access
- create a bespoke AI workflow for every possible command when reusable capabilities would work
- make users restate application context to AI
- make AI generate more review work than it eliminates
- require users to babysit AI
- automatically execute high-consequence external actions merely because AI confidence is high
- optimize owner convenience by harming crew or customer usability
- add configuration when a strong sensible default is sufficient
- make users maintain conTRACKtor instead of using it

## 39. Workflow Measurement Standard

For every important workflow, document:

- Screens
- Taps
- Required typed fields
- Required decisions
- Waiting states
- Estimated attention time
- Can the user leave while processing?
- Can background processing replace waiting?
- What can AI infer?
- What does AI currently make the user do?
- What happens at high confidence?
- What happens at medium confidence?
- What happens at low confidence?
- Is review mandatory?
- Is Undo possible?
- Is original source preserved?
- What happens on failure?

When redesigning an existing workflow, compare before and after. New versions should normally reduce total human attention.

## 40. Implementation Review Checklist

Before implementing a meaningful workflow change, answer:

1. Does this ask for information conTRACKtor already knows?
2. Can AI do any of this work instead?
3. Are we making the user structure information AI could structure?
4. Can context eliminate any input?
5. Can a screen be removed?
6. Can a tap be removed?
7. Can typing be removed?
8. Can capture happen earlier?
9. Can classification happen later?
10. Can processing happen in the background?
11. Can the user safely leave while processing continues?
12. Can the happy path auto-save?
13. Can Undo replace confirmation?
14. Is review reserved for exceptions?
15. Does AI actually eliminate work?
16. Does this AI behavior create unnecessary supervision?
17. Could AI prepare the action while the human only approves the consequential part?
18. Can reusable AI capabilities handle this instead of a bespoke workflow?
19. Is the source preserved?
20. Is processing retryable?
21. Is processing idempotent?
22. What happens offline?
23. What happens on failure?
24. What happens if AI is wrong?
25. Can the user understand and correct the result?
26. Are permissions respected?
27. Are automatic and manual financial states distinguishable?
28. Does this unnecessarily expose implementation concepts?
29. Does this interrupt the user unnecessarily?
30. Does this reduce total human attention?

## 41. Feature Gate

Before adding any new screen, form, field, confirmation, configuration option, required decision, manual categorization, or review step, ask:

```txt
Can conTRACKtor infer this, automate this, prepare this, defer this, process it in the background, or ask only later if it is genuinely needed?
```

Before implementing a new AI-specific workflow, ask:

```txt
Could this instead be accomplished by giving AI a safe reusable capability and the appropriate application context?
```

Before requiring the human to perform an administrative task, ask:

```txt
Why is the human doing this?
```

## 42. Definition Of Success

conTRACKtor succeeds when the software fades into the background.

The contractor should be able to speak naturally, photograph what happened, make important decisions, and do the actual work while conTRACKtor handles as much administrative burden as possible.

```txt
conTRACKtor does the paperwork.
The contractor does the work.
```
