# Bug report — multi-job receipt sheds its jobs, then dead-ends

Date: 2026-09-06 · Reported from device · Receipt: Menards Marshall, 09/03/26, $387.60, job "Tony's Roof"

Four problems. Three are UI/logic bugs with identified root causes; the fourth is a
semantic misclassification in extraction with a deterministic fix.

**Revision 2, after the single-job screenshots:** section C is rewritten — my first
diagnosis (that the extractor under-read the receipt) was **wrong**. The $39.71 is a
real printed mail-in rebate. Section D is new and is arguably the worst of the four.

---

## A. The receipt lost its two jobs on app restart

**Root cause: a multi-job selection is never persisted anywhere.**

`selectedReceiptJobs` is `useState<Job[]>([])` in `app/(tabs)/index.tsx:125`. It is
component state — never written to the database, never to AsyncStorage. Killing the
app resets it to `[]`.

There is also nowhere for it to go. `receipts.scan_context_job_id` is a **single**
uuid, and `receipt_line_items.assigned_job_id` only exists *after* assignment. The
set of destinations chosen at capture time has no column.

On reopen, `app/(tabs)/index.tsx:561` rebuilds the selection with
`item.receiptJobs ?? (item.job ? [item.job] : [])`. But `receiptJobs` is only
populated for **already-saved** receipts, reconstructed from the derived `expenses`
rows (`src/lib/globalActivity.ts:532`, the `receiptExpenseGroups` branch). The
*unreviewed* receipt branch (`globalActivity.ts:538+`) sets only `job`/`jobId` from
`scan_context_job_id` and never sets `receiptJobs`.

So for an unreviewed multi-job receipt the expression evaluates to
`undefined ?? (null ? … : [])` → `[]`. Both jobs are gone, and the receipt shows
`needs_destination`.

This predates the September hardening work — it is an architectural gap, not a
regression.

**Fix direction:** persist capture-time destinations. Either a
`receipt_destinations` join table (receipt_id, job_id, includes_inventory), or a
`scan_context_job_ids uuid[]` column on `receipts`. Then hydrate
`selectedReceiptJobs` from the receipt row on load instead of from navigation
state, and populate `receiptJobs` in the unreviewed branch of `globalActivity`.

---

## B. Once the jobs were reassigned, the receipt cannot be saved at all

The screen shows, simultaneously:

- *Line items required* — "selected for multiple jobs… cannot be saved as one whole-receipt cost"
- *Line items need review* — "Parsed lines add up to $347.89, but the receipt total is $387.60"

…and no line editor. Save is enabled but guaranteed to fail. Only **Remove receipt**
actually does anything.

**Root cause: closing N5 made the trust check two-sided, which re-opened the
original SEV 1.5 dead end in a new form.**

`ReceiptReviewScreen.tsx:131`

```ts
const lineItemsDoNotMatchReceiptTotal =
  hasLineItems && typeof receipt?.total === 'number' &&
  Math.abs(lineItemsTotal - receipt.total) > 0.05;   // two-sided as of the N5 fix
const hasUntrustedLineItems = lineItemsDoNotMatchReceiptTotal;
```

With $347.89 vs $387.60 that is true, and it cascades:

| Predicate | Value | Effect |
| --- | --- | --- |
| `hasUntrustedLineItems` | true | — |
| `requiresLineItems` (multi-job && untrusted) | **true** | whole-receipt save forbidden |
| `shouldShowLineEditor` (needs `!hasUntrustedLineItems`) | **false** | line editor hidden |
| `canSaveLineAssignments` (needs `!hasUntrustedLineItems`) | **false** | line save forbidden |

`handleSave` then short-circuits at its first branch with *"This receipt needs a
clean line-item scan before it can be split across multiple jobs."*

Before the N5 fix, an under-read passed silently and under-costed the job. Now it
hard-blocks. Neither is right — the user needs a way to **fix** it.

**Fix direction:** separate "lines are untrustworthy" from "there is no path
forward". When lines don't reconcile, the screen should still let the user
(a) edit the receipt total, (b) add or correct a line, or (c) fall back to
whole-receipt costing on a single chosen job. Only the *silent* use of
non-reconciling lines for job cost should be blocked. Concretely: stop gating
`shouldShowLineEditor` on `!hasUntrustedLineItems`, and gate the **commit** on
reconciliation instead (the DB trigger `guard_receipt_line_reconciliation` already
does that safely).

Also: the **Save receipt** button should be disabled — not enabled and guaranteed
to error.

---

## C. CORRECTED — $39.71 is real. The rebate is misclassified, not misread.

**My first read of this was wrong.** I assumed the extractor under-read the items.
It did not. Scrolling the receipt photo reveals a **second receipt** stapled below
the sales receipt:

```
MENARDS - MARSHALL
Rebate Receipt
11% Rebate (35A)          Rebate #5002
Offer valid 08-31-26 Thru 09-06-26
You have one year from purchase date to mail in rebates.
Rebate is in the form of a Menards Merchandise Credit Check.
11% Rebate Amount              39.71
```

The extractor found it and created a `discount` line for −$39.71. Its arithmetic is
then exactly right:

```
360.98 items − 39.71 rebate + 26.62 tax = 347.89   ← computed_total
```

All 20 item lines are present and correct. Nothing was dropped or misread.

**The error is semantic.** A Menards 11% rebate is a **mail-in rebate**: a future,
conditional benefit paid as a separate merchandise credit check, redeemable within a
year. It does **not** reduce this purchase. The contractor paid $387.60
(`Discover Credit 7594  387.60`), and the job cost at the time of purchase is
$387.60.

The extraction prompt says to include Menards rebate rows as discounts *"when they
affect the subtotal or amount paid."* This one affects neither — but the prompt
spends so many words on catching Menards rebates that the qualifier lost.

### The deterministic fix

Do not rely on the model's judgment. The receipt's own arithmetic settles it:

```
TOTAL      360.98   (items)
TAX         26.62
TOTAL SALE 387.60   = amount tendered
```

Items + tax already equals the amount paid, so **there is no room for a discount**.

Rule for `normalizeExtraction`: **if `itemTotal + tax ≈ printed total` (within
tolerance), discard any `discount` lines** — they are future rebates, not
adjustments to this purchase. Optionally keep them as a non-costing memo so the
contractor still sees "you have a $39.71 rebate to mail in," which is genuinely
useful, but never let them touch `computed_total` or job cost.

That single rule fixes this receipt end to end: `computed_total` becomes 387.60,
`total_discrepancy` becomes 0, the receipt reconciles, all 20 lines stay, both the
single-job and multi-job paths work, and auto-finalize becomes eligible again.

### Secondary: the discrepancy check worked, the resolution didn't

Worth being clear that the SEV-1.1 machinery did its job — it caught a real
inconsistency and refused to silently cost the job at $347.89 (which would have
under-costed by $39.71). The failure is entirely in what the product offers next.

### Minor extraction-quality notes (cost unaffected)

- `100PK 1/2" HALF CLAMP` → cleaned_name **"1 inch half clamp"**. Wrong on both
  counts: it is a 100-pack of 1/2-inch clamps.
- `1-1/2" 45DEG STRET EL 10P` → rendered as `Qty 2 · $4.41 each`. The receipt prints
  no quantity for that line, only the extended $8.82. The quantity/unit price were
  invented; the extended amount is right, so cost is unaffected.

---

## D. NEW — the single-job path has no Save button at all

The single-job screenshots show the screen promising a fallback:

> **Use receipt total instead** — "The parsed lines do not match the receipt total,
> so conTRACKtor will ignore those parsed lines and save the corrected receipt
> details below."

…followed by the full editable form, correctly pre-filled (360.98 / 26.62 / 387.60,
amount applied 387.60, category Materials) — and then **only "Remove receipt."**

**Root cause** — `ReceiptReviewScreen.tsx:1279`:

```ts
) : isSingleJobLineReceipt && !shouldShowLineEditor ? null : (
   <Pressable …>Save receipt</Pressable>
)
```

With one job, line items present, and untrusted lines:

| Predicate | Value |
| --- | --- |
| `isSingleJobLineReceipt` (1 job && hasLineItems) | true |
| `shouldShowLineEditor` (needs `!hasUntrustedLineItems`) | false |
| `isSingleJobLineReceipt && !shouldShowLineEditor` | **true → renders `null`** |

The `quickConfirmPanel`, the only other place with a save action, also requires
`!hasUntrustedLineItems`, so it does not render either.

So the UI states in plain language that it will save the corrected details, shows a
filled-in form, and provides no control that saves it. This is worse than the
multi-job dead end in B, because there the button at least exists and explains
itself. Here the promise is made and silently withdrawn.

**Fix:** the `null` branch should only apply when a save action is genuinely
rendered elsewhere on screen. Gate it on the quick-confirm panel actually being
shown, not on `!shouldShowLineEditor`.

---

## Also worth fixing while in here

- **Save receipt is enabled in a state where it can only error.** Disable it, or
  label it with what is missing.
- **The "review the printed amount before saving" message has no field to act on.**
  In the untrusted-lines state, the editable vendor/date/total form is not reachable,
  so the instruction cannot be followed.
- **`isSavedReceipt` depends on `!requiresLineItems`**, so a receipt can be saved and
  still present as unsaved if that predicate later flips.
