# conTRACKtor MVP Definition

The MVP proves one thing:

> conTRACKtor is the easiest way for a small contractor to capture what
> happened on a job and know whether that job made money.

## Core Job Loop

A contractor can:

1. Create a fixed-bid or time-and-materials job.
2. Record labor, including basic crew hours.
3. Capture receipts and material costs.
4. Record notes, photos, and important job events.
5. Find that reality organized under the correct job.
6. See a basic financial picture of the job.

Everything in the MVP must make this loop materially easier, safer, or more
useful.

## Primary Capture Methods

The product begins with three ways to give conTRACKtor reality:

### Tell conTRACKtor

Use normal language for facts the contractor already knows. MVP Tell supports:

- labor hours
- job notes and events
- shopping needs

Tell proposes structured records for review. Approval must commit the proposal
atomically and idempotently so retrying cannot create duplicates. Expenses may
be added later if they can use the same safe capability boundary. Payments are
not part of the initial Tell scope.

### Capture Receipt

Use the camera for physical purchase evidence. conTRACKtor secures the image,
extracts the receipt, and asks only for destinations or uncertainty it cannot
safely resolve.

### Start Work

Every active job offers a timer for work happening now, with manual hours as the fallback.

All three inputs feed the same job history and financial model.

## Primary Places

### Home

- Capture Receipt
- Tell conTRACKtor
- Start Work
- Recent Activity / Needs Attention

### Jobs

- current jobs
- completed and historical jobs
- new-job setup

### Job

- basic deterministic Snapshot: attention, shopping, hours, recorded cost,
  fixed-bid balance/profit, and latest activity
- History
- Financials
- Shopping and relevant source records

The Snapshot explains only recorded facts and deterministic calculations. For
time-and-materials work, customer balance remains unknown until invoicing; the
Free Snapshot must not invent it from unbilled labor or materials.

## MVP Scope

| Area | MVP boundary |
| --- | --- |
| Jobs, customer basics, status | Included |
| Fixed bid and time & materials | Included |
| Labor and basic crew hours | Included |
| Receipt capture and AI extraction | Included |
| Multi-job receipt allocation | Included |
| Manual expenses | Included |
| Notes and job photos | Included |
| Lightweight shopping needs | Included |
| Job history / timeline | Included |
| Basic Job Snapshot | Included |
| Scoped Tell conTRACKtor | Included |
| Job costing and gross-profit view | Included |
| Basic estimates | Included |
| Invoices | Basic or slightly deferred |
| Payments ledger | Existing capability; not an MVP development priority |
| Accounting replacement | Excluded |
| Scheduling, dispatch, CRM, portal | Excluded |
| Payroll, fleet, advanced inventory | Excluded |
| Deep project management | Excluded |

Existing out-of-scope capabilities do not need to be deleted. They should stay
out of primary navigation and must not delay the core loop.

## MVP And Monetization

The current build is the permanent truth layer plus the first compelling
automation loop on top of it. It is not simply "building Free."

Basic Tell conTRACKtor belongs in the core product and in Free because it is a
primary way to record job truth. Higher Tell/AI usage, cross-record reasoning,
proactive suggestions, and clerical automation belong in Pro. See
[subscription-tiers.md](subscription-tiers.md) for the governing boundary.

## Finish Line

The MVP is complete when one real contractor can run one entire real job from
start to completion and answer, without a spreadsheet or notebook:

- What happened?
- What did I spend?
- How much labor went into it?
- What does the customer owe me?
- Did I make money?

The contractor must be able to provide that information without taking on an
office-worker workflow.

## Scope Test

Before adding or prioritizing a feature, ask:

> Does this help conTRACKtor capture reality, organize reality, or explain the
> financial reality of a job?

If it does not, it is not MVP work.
