# Receipt extraction — review of the hardening changes

Date: 2026-09-04 · Reviewing the uncommitted working tree against `4b27a65`
Companion to `audit-2026-09-04.md` (rev 2)

Method: every "verified" claim below was produced by compiling the new
`receipt-normalization.ts` and executing it against the same payloads that
reproduced the original defects — not by reading the diff. Independent
verification run: `tsc --noEmit` clean, `npm test` 90/90 pass.

> **Status update 2 (2026-09-04, end of day).** The full eight-step sequence was
> reported complete. Re-verified by execution:
>
> | Item | Status |
> | --- | --- |
> | N1 + residual | **closed** — `quantity`/`unit_price` clamped unconditionally; all four negative shapes now DB-safe |
> | N2 | **closed** — choice restored via `shouldOfferReceiptAdjustmentChoice`; server honours `allowGrossLineCost` |
> | N3 | **closed** — auto-finalize restored behind `shouldAutoFinalizeReceipt` with 17 preconditions incl. duplicate-check-complete, trusted line confidence, and line/total reconciliation; dead `= false` constant gone |
> | N5 | **closed** — new `guard_receipt_line_reconciliation` trigger blocks line-mode commits whose lines don't reconcile to the amount paid |
> | N9 | **closed** — `pgmq.q_receipt_processing` internal access removed; `finalize_receipt_capture` rewritten in `20260904015000` |
> | N10 | **closed** — visibility timeout 300 s → 900 s, aligned with the lease window |
> | N11 | **closed** — `receipts_storage_path_idx` added |
> | N4 | **disproven 2026-09-05** — a BEFORE INSERT trigger fills `business_id` from `owner_id`; the finding was wrong |
> | U1 (uncommitted) | **resolved 2026-09-05** — two clean, independently revertible commits |
> | U2 (trigger grandfathering) | **closed 2026-09-05** — measured blast radius is zero |
> | Steps 4–6 | reported complete; README/testing-regime updated to assert `extract-receipt` absent |
>
> **Remaining open, all previously classed minor and outside the executed
> sequence:** N6 (`toMoney` rejects >2-decimal quantities — `0.333` → null),
> N7 ($0.00 lines dropped), N8 (`recover_stale_receipt_processing` under-counts).
>
> Suite now 94/94, `tsc` clean. Two new concerns raised: **U1** (uncommitted) and
> **U2** (the new trigger vs. pre-existing receipts).

> **Implementation verification (2026-09-04).** N4 did not reproduce in
> production: 21 line items exist across two receipts, with no post-June receipt
> processing failures. A clean local Supabase reset applied every migration,
> the database integration suites passed, the duplicate-line backfill was
> exercised with forced duplicate data, and `db lint --level warning` was clean.
> Migrations were deployed before `process-receipt-queue`; the live worker is
> version 18, the web bundle contains the hardened receipt flow, and the retired
> `extract-receipt` function is absent. U2 also has no production blast radius:
> the sole accepted line-mode receipt reconciles, so there are zero legacy
> mismatches to grandfather. U1 is resolved by the receipt-only commit containing
> this report; unrelated invoice and marketing changes remain outside it.

**Verdict: the release-critical defects are genuinely dead, and the fixes are
better-designed than what the audit asked for. One new bug must be fixed before
deploy (N1). Two product decisions were made silently and need your sign-off
(N2, N3). One probable pre-existing production bug surfaced during review (N4).**

---

## Part 1 — Verified fixed

Re-ran every original reproduction against the new module:

| Original defect | Before | After | Status |
| --- | --- | --- | --- |
| 1.1 Hallucinated discount rewrites total | 1070 → 970, graded `accepted` | total stays **1070**, `computed_total` 970, `total_discrepancy` −100, `needs_review`, message names both figures | **fixed** |
| 1.2 `includes('card')` eats items | CARDBOARD/gift card/placard dropped | all kept; `MENARD CARD`, `VISA ENDING IN 4242`, `DEBIT CARD 1234`, `Credit payment approved` correctly dropped | **fixed** |
| 1.3 Negative item → positive charge | −50 became +$50 cost | reclassified to `discount`, `line_total` 50 | **fixed** |
| 1.4 Trailing-minus / parens dropped the line | `299.57-` → null → rebate deleted | `299.57-` → −299.57, `(299.57)` → −299.57, `$-50.00` → −50; rebate row survives | **fixed** |
| 1.5 Discounts never reduce line-mode cost | multi-job rebate = hard dead end | discount pro-rated per item in `commit_receipt_review`; client math updated to match; multi-job split works | **fixed** |
| Date sanity | 2099 and 1999 accepted | window is `today+1` … `today−3y`; 2026-09-06 and 2023-09-03 rejected | **fixed** |
| Null line confidence auto-passed | `confidence === null \|\| >= 0.6` | requires a number ≥ 0.6 — fails closed | **fixed** |
| No line cap | 5,000 lines all inserted | capped at 250, `line_items_truncated` flag, explicit message | **fixed** |
| Duplicate line numbers | `[1,1]` | `[1,2]` + DB unique index on `(receipt_id, line_number)` with backfill | **fixed** |

Legit cases still pass: a real Menards rebate receipt (gross subtotal printed,
$299.57 rebate, $770.43 paid) reconciles with `total_discrepancy = 0` and grades
`accepted`; a clean receipt grades `accepted` with no error message.

**Design quality above spec.** The pipeline fixes are better than what the audit
asked for:

- Splitting `total` (as printed) from `computed_total` (from lines) with an
  explicit `total_discrepancy` is the right model — it makes the disagreement a
  first-class value instead of a hidden overwrite. The reconciliation retry now
  also triggers on discrepancy, not just on overage.
- The queue rework fixes the "never terminal" hole **at the right layer**:
  `processing_attempts` is now incremented inside `claim_receipt_processing_jobs`
  *before* the work, and the terminal check runs at claim time. That closes the
  path where a poisoned message re-fired forever without ever incrementing.
  Poison messages (bad UUID, missing receipt) are now deleted at claim.
- `processing_lease_id` + a 15-minute stale window + a `*/5` recovery cron +
  lease-checked persistence is a genuinely correct lease model. Concurrent
  workers can no longer double-process, and `persist_receipt_extraction` refuses
  to write under a stale lease.
- `commit_receipt_review` now rejects `processing_status <> 'complete'`, and the
  claim function clears a leftover `processing` state on already-accepted
  receipts. Both halves of the commit-during-processing race are handled.
- `CTX:` marker on intentional errors — the right call, and the safer one over
  the deny-list the audit originally suggested.
- The invoiced-expense guard names the actual invoice number.
- Authorization is now coherent: client `owner_id` filters removed, duplicate
  detection business-scoped, and a business-scoped storage SELECT policy. Reads
  are business-scoped, writes stay owner-scoped, deliberately.
- `tests/receipt-normalization.test.mjs` is a **real behavioral suite** — it
  transpiles the module and executes it (9 tests, 29 assertions) over exactly the
  reproduced cases. This is the single most valuable file in the change.

---

## Part 2 — New problems

### N1. Negative `unit_price` / `quantity` survive discount reclassification → extraction hard-fails. **Partially fixed — residual below.**

`normalizeLineItem` applies `Math.abs()` to `line_total` when reclassifying a
negative line to `discount`, but leaves `unit_price` and `quantity` signed.
Verified output for a printed returned item:

```json
{ "line_type": "discount", "line_total": 50, "unit_price": -50, "quantity": 1 }
```

`receipt_line_items_amounts_check` requires `quantity >= 0` and
`unit_price >= 0`. So the INSERT inside `persist_receipt_extraction` raises a
check-constraint violation → `processReceiptImage` catch → `markNeedsReview` →
retry → terminal failure after **three full OpenAI extractions**.

Net effect: a receipt with a printed return/credit line used to be silently
mis-costed; it now fails outright and costs 3× the API spend to do it. Fail-loud
beats fail-wrong, but this path is unhandled, untested, and one line to fix —
`Math.abs()` (or null) both fields when `lineType === 'discount'`. Add a fixture.

**Fixed, with a residual.** `normalizeLineItem` now abs's `quantity` and
`unit_price` — but only `when lineType === 'discount'`. A line that stays
`item` with a positive `line_total` and a negative `unit_price` or `quantity`
(a misread "2 @ -12.50", a credit row whose extended amount reads positive)
still emits negatives and still violates `receipt_line_items_amounts_check`,
producing the same terminal failure after three OpenAI calls. Verified:

```
{unit_price:-25, line_total:50}  -> {type:'item', q:1,  u:-25}  db check FAILS
{quantity:-2,    line_total:50}  -> {type:'item', q:-2, u:1}    db check FAILS
```

The invariant is "these two columns are non-negative", not "non-negative on
discount rows". Clamp both unconditionally and add the positive-total case to
the fixtures — `tests/receipt-normalization.test.mjs:103` covers only the
negative-`line_total` path.

### N2. The gross-costing choice is now unreachable — a product decision made by side effect. **FIXED.**

Proved by exhaustive search over **1,042,668** combinations of item total,
discount, tax and printed total: `requiresReceiptAdjustmentChoice` is **never
true**.

The two conditions are now mutually exclusive by construction.
`getReceiptAdjustmentDecision` returns non-null only when
`items − discounts + tax ≈ total`; the rewritten `getLineItemsTotal` computes
exactly that quantity, so whenever the decision exists,
`lineItemsExceedReceiptTotal` is false.

Dead as a result:

- the "Use amount paid / Use full item prices" panel never renders
- `handleUseFullItemPricesForAdjustment` always early-returns
- `confirmReceiptLineAssignmentsUsingGrossItemCost`, `allowGrossLineCost`, and
  `cost_basis = 'gross_items'` are unreachable from the UI

Discounts are now **always** netted into job cost. That is right for a rebate
passed through to the customer. It is wrong for a contractor who banks a Menards
rebate personally and bills the job at gross — a real accounting choice this
product previously supported and now silently removes, with no opt-out.

Note the existing boundary test *"generic line assignment cannot authorize gross
receipt costing"* still passes, because it asserts on source text. A behavioral
test would have caught the whole feature going dark. Exactly the weakness the
audit called out.

**Resolved.** The choice was restored, gated on the discount's presence rather
than on an overage, and moved into `src/lib/receiptAdjustments.ts` behind
`shouldOfferReceiptAdjustmentChoice` with behavioral tests. The server now
skips discount allocation when `allowGrossLineCost` is set
(`when not v_allow_gross and v_item_total > 0 then ...`), so the three paths
produce three distinct, correctly-labelled numbers — verified on the canonical
$1,000 / $299.57 rebate / $70 tax receipt: amount paid $770.43, full item
prices $1,070.00 (`cost_basis = 'gross_items'`), normal line save $770.43.
Multi-job and inventory receipts are correctly excluded, so the SEV 1.5 fix is
preserved.

### N3. Auto-finalize was removed — also a product decision, also silent.

The audit flagged auto-finalize as *your call, not a defect*. It has been
removed. Every clean single-job receipt now requires a manual Save tap, which
cuts against "minimize the human attention required."

Residue: `const isAutoFinalizing = false;` remains with **15 live references**
threading a permanently-false value through disabled states and labels.

**Decision needed:** if removal was intended, delete the dead constant and its
references. If it was meant to be gated until the number is trustworthy — which
it now is — restore it behind the discrepancy check.

### N4. Probable pre-existing production bug — **DISPROVEN 2026-09-05. This finding was wrong.**

Production queries: 21 line items across 2 receipts, latest insert
2026-09-04 03:22:12 UTC (i.e. under the **old** code path, well after the June 8
NOT NULL migration), 0 processing failures since June 8. Service-role line-item
insertion has been working the whole time. This was a hardening deployment, not a
data-recovery event.

**Why the reasoning failed.** `20260608095000_business_team_foundation.sql:473`
installs `set_receipt_line_items_business_owner_columns`, a BEFORE INSERT trigger
running `set_business_owner_columns()`:

```sql
if new.business_id is null then
  new.business_id := public.default_business_for_user(new.owner_id);  -- owner_id, not auth.uid()
end if;
```

It derives `business_id` from the **row's `owner_id`**, which the old
`replaceDraftLineItems` did supply. So the column default
(`default_business_for_user(auth.uid())`) being useless under service_role — which
was correct — never mattered: the trigger fills the null before the NOT NULL check.

I read the column default and the NOT NULL constraint and inferred the rest,
without enumerating what else fires on that table. Earlier in the same audit I
*had* enumerated triggers on `receipts` and `expenses`; I simply never asked the
question about `receipt_line_items`. Same class of error as the rev-1 RLS mistake:
reading one schema layer and extrapolating. **Rule for next time: before claiming
a column can't be populated, list every default, trigger, and rule on that table.**

Original (incorrect) reasoning preserved below for the record.



`receipt_line_items.business_id` has been **NOT NULL** since
`20260608095000_business_team_foundation.sql:392`, with column default
`default_business_for_user(auth.uid())`.

The old `replaceDraftLineItems` inserted line items through PostgREST using the
**service-role** client, where `auth.uid()` is NULL. `default_business_for_user`
selects `where b.owner_id = p_user_id` — NULL matches nothing — so the default
resolves to NULL and the insert violates NOT NULL.

If that reading is right, **worker line-item insertion has been failing since
June 8**: every receipt that produced line items would have failed extraction and
landed in needs_review. The new `persist_receipt_extraction` sets `business_id`
explicitly from the receipt row, which fixes it as a side effect.

This is code reading, not a live query. Confirm before deploying:

```sql
select count(*), max(created_at) from public.receipt_line_items;
select processing_status, status, count(*), max(error_message)
from public.receipts where created_at > '2026-06-08' group by 1, 2;
```

If it holds, it changes what "live and in beta" has actually been doing, and it
makes this change more urgent than its stated scope.

### N5. Under-reading is detected but never enforced.

`total_discrepancy` catches partial OCR and `needsManualReceiptReview` displays
the message, but neither `handleSave` nor `commit_receipt_review` blocks on it,
and `lineItemsExceedReceiptTotal` only catches the **over** direction. A receipt
whose lines sum to less than the amount paid can still be committed, silently
under-costing the job. Not a regression — but the new detection creates the
expectation that it is handled, and it isn't.

### N6–N8. Minor

- **`toMoney` is a money parser doing duty as a quantity parser.** Its regex
  allows at most two decimals, so `quantity: '0.333'` (0.333 lb of wire, 2.75 hr)
  → `null`. Cosmetic — quantity is not in the cost math — but it blanks the field
  in review.
- **`$0.00` lines are dropped** (`parsedLineTotal === 0` → null), so promotional
  and free lines vanish from the itemization.
- **`recover_stale_receipt_processing` returns the wrong count** —
  `get diagnostics` sits after the second UPDATE only, so recovered
  accepted/voided rows aren't counted. Return value is unused by cron; cosmetic.

### N9–N11. Robustness / operational

- **`finalize_receipt_capture` reaches into `pgmq.q_receipt_processing`
  directly** to dedupe before re-queuing. That table name is a pgmq internal, not
  its public API (`read`/`send`/`delete`/`archive`). Works today, fragile across
  pgmq upgrades. Prefer archiving via the supported surface.
- **Lease/visibility mismatch.** pgmq visibility is 300 s but the stale-lease
  window is 15 min, so a hung job's message is re-read and re-hidden roughly three
  times — each hitting the "still fresh" `continue` and burning one of the six
  claim slots — before the lease expires. Harmless, wasteful. Align the visibility
  timeout with the lease window.
- **No index on `receipts.storage_path`.** The new business-scoped storage SELECT
  policy runs `exists (select 1 from receipts where storage_path = objects.name)`
  on every receipt-image read. Add `create index on public.receipts (storage_path)`.
- **None of the SQL has executed.** Five new migrations, including two large
  function replacements and a data-migrating unique index. `tsc` and the node
  tests do not touch Postgres. The `database-integration` CI job (or a local
  `supabase start`) must run before deploy — the line-number backfill and the
  unique index are the riskiest pieces against real data.

---

## Recommended sequence

1. **N1** — abs/null `unit_price` and `quantity` on discount reclassification, plus a fixture. One line.
2. **N4** — run the two confirmation queries. The answer changes the deployment story.
3. **N2, N3** — decide the two product questions, then delete or restore the dead paths.
4. Run `database-integration` against an ephemeral Supabase; verify the line-number backfill and unique index against a copy of production data.
5. Deploy migrations → worker → client, in that order (`persist_receipt_extraction` and the lease columns must exist before the new worker runs).
6. Delete the remote `extract-receipt` function once the new client is live.
7. **N5** — decide whether an under-read discrepancy should block commit.
8. **N9–N11** — pgmq API surface, visibility alignment, `storage_path` index.


---

## Status-2 addendum: still unverified, and two new concerns

### Still unverified (cannot be checked from this session)

- **N4** — the two `business_id` confirmation queries. Nothing in the repo records
  an answer. This is the item that changes the deployment story; if worker
  line-item insertion really has been failing since June 8, the deploy is a
  data-recovery event, not just a fix.
- **Step 4** — `database-integration` against an ephemeral Supabase. No evidence
  in the tree. `tsc` and the node suite never touch Postgres, so six migrations
  including three function replacements, a data-migrating unique index, and a new
  hard-raising trigger have still not provably executed here.
- **Steps 5–6** — migration/worker/client deploy order, and deletion of the remote
  `extract-receipt` function. Not observable from the repo.

### U1. The entire change is still uncommitted — **RESOLVED 2026-09-05**

Landed as two clean commits: `959e7bb fix(receipts): harden extraction pipeline`
(30 files, the whole receipt change self-contained) and `12f7b58 chore(db): record
deployed September migrations` (the five pre-existing September migrations, kept
separate). Independently revertible. Original finding preserved below.

### U1. The entire change is still uncommitted

`git log` head is unchanged at `4b27a65`. The receipt work is 6 modified files,
2 deletions, and 6 new migrations sitting in the working tree, interleaved with
unrelated invoice-ledger and marketing changes. If migrations were pushed to
Supabase from this tree, no commit records what was deployed — there is no way to
correlate live DB state with a revision, and one bad `checkout` loses it.

Commit the receipt work as its own commit before deploying, separate from the
invoice/marketing changes, so it can be reverted independently.

### U2. The new reconciliation trigger is not grandfathered — **CLOSED 2026-09-05, not applicable**

Blast radius measured in production: 1 accepted line-mode receipt checked,
**0 legacy reconciliation mismatches**. Nothing to grandfather; leaving
`20260904015000` unchanged was the right call.

Original concern preserved below.

### U2 (original). The new reconciliation trigger is not grandfathered

`20260904015000` is byte-identical; no backfill, no scoping, no new migration.

**This may be correct, and it hinges entirely on N4.** If worker line-item
insertion really has been failing since June 8, then no production receipt has
populated line items under `cost_basis in ('line_items','gross_items')`, the
trigger's blast radius is zero by construction, and there is nothing to
grandfather. If line items *have* been inserting, the hazard below is live and
every affected receipt becomes uneditable in line mode.

One query settles it — it is the same one at the end of this section. Until it is
run and the answer written down, this stays open.

### U2. The new reconciliation trigger is not grandfathered against existing receipts

`guard_receipt_line_reconciliation` fires `before insert or update of status,
cost_basis, total, tax` and raises whenever an **accepted** receipt with
`cost_basis in ('line_items','gross_items')` has lines that don't reconcile to
`total` within $0.05.

That is correct for new receipts. But it also fires on any future edit of a
receipt accepted under the **old** code — and those are exactly the receipts whose
lines don't reconcile, because the old extractor dropped every line containing
"card", mis-signed negatives, and allowed gross costing. Re-reviewing or editing
line assignments on such a receipt now raises
*"Receipt lines do not match the amount paid"* with no indication that the receipt
predates the fix and no path other than re-scanning or saving it as one whole-receipt
cost.

Migration `20260904015000` contains no backfill and no grandfathering clause.
Decide deliberately: accept it (those receipts hold wrong data anyway), scope the
trigger to receipts created after the rollout, or backfill. At minimum, confirm the
blast radius with the same query family as N4:

```sql
select count(*)
from public.receipts r
where r.status = 'accepted'
  and r.cost_basis in ('line_items', 'gross_items')
  and abs(
    coalesce((select sum(line_total) filter (where line_type = 'item')
              from public.receipt_line_items where receipt_id = r.id), 0)
    - coalesce((select sum(line_total) filter (where line_type = 'discount')
                from public.receipt_line_items where receipt_id = r.id), 0)
    + coalesce(r.tax, 0) - coalesce(r.total, 0)
  ) > 0.05;
```
