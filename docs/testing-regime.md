# conTRACKtor Testing Regime

This regime is designed for Phase 1 shipping readiness. It combines release gates, structured manual testing, security checks, export checks, and a practical automation roadmap.

Phase 1 success standard:

```txt
A contractor can create jobs, capture costs, log hours, record payments, attach notes/photos, export invoices/reports, and trust the job totals.
```

## Test Principles

- Financial correctness beats visual polish.
- Receipts, line items, expenses, hours, and payments must not silently corrupt totals.
- Every test pass must cover both web and phone for the workflows that differ by platform.
- Use clean test users often; old data can hide setup and RLS bugs.
- Treat parser deployment as part of testing, not a separate ops chore.

## Release Gates

These must pass before any serious manual test pass:

```sh
npx tsc --noEmit
npm run lint
npm test
supabase db push
supabase migration list
supabase functions list
```

Required Supabase state:

- Local and remote migrations match.
- `extract-receipt` is deployed after the latest parser changes.
- `receipts` bucket exists and is private.
- `attachments` bucket exists and is private.
- `OPENAI_API_KEY` is set for the Edge Function.

Required app state:

- Web starts with `npm run web`.
- Mobile starts with `npx expo start`.
- Test phone can open the app in Expo Go.
- Test account can sign up, sign in, and sign out.

## Test Accounts

Use at least two users:

- `tester-a`: main end-to-end workflow user.
- `tester-b`: RLS/security isolation user.

For `tester-a`, create realistic data. For `tester-b`, create one job and verify they cannot see `tester-a` data.

## Canonical Test Data

Create these jobs:

1. Fixed bid job
   - Quote amount: `$15,000`
   - Material budget: `$8,000`
   - Labor hour budget: `80`
   - Hourly rate: `$65`
   - Other estimated costs: `$500`
   - Crew: current user, one helper at a different rate

2. Time & materials job
   - Labor billing/hourly rate set
   - At least one crew member
   - No fixed quote expectation

3. Basic no-budget job
   - Job name, client, location only
   - Used to verify `Ready to track` and missing budget behavior

4. Tools / Inventory bucket
   - At least one manual tool expense
   - At least one receipt-assigned tool line

Use these receipt scenarios:

- Clean single-job receipt.
- Single-job receipt with line items and tax.
- Multi-job receipt.
- Mixed job plus Tools / Inventory receipt.
- Duplicate receipt.
- Receipt with tax/fee/total/payment rows visible.
- Receipt where parsed line items could exceed total.

## Test Pass Levels

### Level 0: Static Gates

Run:

```sh
npx tsc --noEmit
npm run lint
npm test
supabase migration list
supabase functions list
```

Pass criteria:

- No TypeScript errors.
- No lint errors.
- Migrations aligned.
- `extract-receipt` is active.

### Level 1: Smoke Test

Goal: prove the app opens and the main routes are not broken.

Verify the Job Snapshot for both canonical job types:

- Fixed bid shows attention, shopping, hours, recorded cost, recorded balance,
  projected profit, and last activity from existing records.
- Time & materials does not infer a customer balance before invoicing.

Verify Tell correction and Undo:

- Edit or remove a proposal before approval and confirm only the reviewed
  proposal is committed.
- Undo an unchanged Tell update and confirm all of its notes, hours, shopping
  needs, and attachment records are removed.
- Edit one committed record directly, then confirm Tell Undo refuses to delete
  the human correction.

Web:
- Start `npm run web`.
- Sign in.
- Open Home.
- Open Jobs.
- Open one job dashboard.
- Open Create job.
- Open Tools / Inventory.
- Return home without crashing.

Mobile:
- Start `npx expo start`.
- Open in Expo Go.
- Sign in.
- Open Home.
- Open Jobs.
- Open Add expense.
- Open Add hours.
- Open Add note.

Pass criteria:

- No red screens.
- No blank screens.
- Back actions work.
- Primary buttons are reachable.

### Level 2: Core Workflow Test

Goal: prove the main Phase 1 promise works.

Run this sequence with `tester-a`:

1. Create fixed bid job with budgets and crew.
2. Create time & materials job.
3. Create no-budget job.
4. Add manual expense to fixed bid job.
5. Add manual expense to Tools / Inventory.
6. Add hours with current user rate.
7. Add hours with helper rate.
8. Edit an hours entry and change hourly rate.
9. Add customer payment.
10. Add note with photo.
11. Upload receipt on web.
12. Capture receipt on phone.
13. Assign receipt lines to one job.
14. Assign receipt lines across multiple jobs.
15. Assign at least one line to Tools / Inventory.
16. Export invoice.
17. Export job report.
18. Export receipt photos.

Pass criteria:

- Job dashboard totals update after every saved financial record.
- Recent activity shows manual expenses, receipts, hours, payments, and notes.
- Labor cost reflects the saved hourly rates.
- Materials cost reflects expenses, not raw receipt rows.
- Tools / Inventory costs do not inflate job material cost.
- Invoice/report exports open/share/download successfully.

### Level 3: Financial Regression Test

Goal: catch silent bad math.

Fixed bid checks:
- Material usage equals material expenses divided by material budget.
- Labor usage equals logged hours divided by labor hour budget.
- Labor cost equals sum of `duration_minutes / 60 * hourly_rate`.
- Payments reduce balance but do not reduce material or labor costs.
- Manual expenses are included in cost totals.
- Ignored receipt lines are excluded.

T&M checks:
- Card/dashboard show tracked labor/materials instead of fixed-bid budget usage.
- Invoice uses tracked labor/materials and payments.
- No fixed-bid quote assumptions leak into T&M display.

Receipt checks:
- Tax line itself does not become an expense.
- Tax is allocated only to item expenses where applicable.
- Assigned line total plus allocated tax cannot exceed receipt total.
- Duplicate detection blocks or warns before duplicate cost creation.
- Editing line assignments replaces prior expenses correctly.

Pass criteria:

- Every expected total can be reconciled manually from the source records.
- No total is higher than the source receipt total.
- No duplicate expense exists after duplicate handling.

### Level 4: Document Export Test

Goal: make exports feel usable from phone and PC.

Invoice:
- Fixed bid invoice shows quote/contract amount, payments, balance due.
- T&M invoice shows labor/material billing data.
- Filename defaults to `[Job Name] Invoice.pdf`.
- No `Invoice draft` title appears in exported invoice.
- Mobile export/share works from phone.
- Web export/print works from PC.

Job report:
- Filename defaults to `[Job Name] Report.pdf`.
- Summary appears first.
- Job Info follows Summary.
- Budget / Quote follows Job Info.
- Receipts / Expenses are grouped by date and vendor.
- Manual expenses appear in the same expenses section.
- Labor under one hour displays in minutes.
- Empty sections say `None logged.`
- No browser print chrome appears in web PDF.
- Footer appears once at the bottom, not between sections.
- Receipt photo export works separately.

Pass criteria:

- Exported documents can be opened outside the app.
- Documents have contractor-ready wording.
- Documents do not expose `localhost`, browser timestamps, or debug text.

### Level 5: Security / RLS Test

Goal: prove users cannot see each other's data.

With `tester-a`:
- Create jobs, receipts, expenses, hours, payments, notes, attachments, crew.

With `tester-b`:
- Sign in.
- Verify `tester-a` jobs do not appear.
- Create one separate job.
- Verify reports, notes, receipt images, attachment images, and Tools / Inventory only show `tester-b` data.

Direct checks:
- Try opening a signed URL after it expires.
- Verify storage paths start with the owner id.
- Verify private buckets are not public.

Pass criteria:

- `tester-b` cannot view or mutate `tester-a` data through app flows.
- Private storage remains private.

### Level 6: Platform-Specific Test

Web / PC:
- Web upload receipt works.
- Web camera preview appears on localhost.
- Web `Take photo` button is visible.
- Captured web photo routes to the parser.
- Keyboard and mouse can operate long forms.
- Narrow browser width remains usable.

Mobile / Expo Go:
- Receipt camera capture works.
- Receipt library upload works.
- Note photo capture/upload works.
- Native share works for invoice/report PDFs.
- Keyboard does not hide save buttons.
- Safe areas do not hide floating actions.

Pass criteria:

- Platform-specific capture/export paths work on the actual target device.

## Detailed Manual Scripts

### Script A: New User Setup

1. Open app.
2. Sign up as `tester-a`.
3. Confirm Home loads.
4. Open account menu.
5. Confirm account menu does not immediately log out.
6. Log out.
7. Log back in.

Expected:
- Auth persists correctly.
- Logout is intentional.

### Script B: Fixed Bid Job

1. Create job.
2. Select Fixed bid.
3. Enter basics, budgets, quote, and crew.
4. Save.
5. Open job dashboard.
6. Confirm card/dashboard show fixed-bid budget behavior.
7. Edit job.
8. Change one budget and one crew rate.
9. Save and reopen.

Expected:
- Edited values persist.
- Crew rates are available when adding hours.

### Script C: Time & Materials Job

1. Create job.
2. Select Time & materials.
3. Enter basics and labor rate.
4. Save.
5. Add hours and material expense.
6. Return to Jobs.

Expected:
- Card shows tracked labor/materials, not fixed-bid budget percentages.

### Script D: Manual Expense

1. Open fixed bid job.
2. Add update.
3. Add expense.
4. Choose Manual expense.
5. Enter description, amount, category, date, billable, notes.
6. Save.
7. Verify recent activity.
8. Verify material drill-down and totals.

Expected:
- Expense is included in job totals.
- No receipt row is created.

### Script E: Tools / Inventory

1. Open Tools / Inventory.
2. Add manual expense.
3. Save a tool expense.
4. Confirm total tracked value changes.
5. Add receipt and choose Tools / Inventory plus one job.
6. Assign one line to job and one line to Tools / Inventory.
7. Save.

Expected:
- Job receives only its assigned line.
- Tools / Inventory receives only its assigned line.

### Script F: Hours And Crew

1. Open fixed bid job.
2. Add hours.
3. Pick current user crew member.
4. Save hours.
5. Add hours again.
6. Pick helper crew member.
7. Save hours.
8. Edit helper hours and change hourly rate.
9. Save.
10. Open labor drill-down.

Expected:
- Labor cost reflects each entry's saved rate.
- Edited hourly rate changes labor cost.

### Script G: Receipt Parser Safeguards

1. Deploy `extract-receipt`.
2. Upload receipt with visible tax/fee/total/payment lines.
3. Confirm tax/fee/total/payment rows are not saved as expenses.
4. Upload receipt where line parsing could exceed receipt total.
5. Confirm app forces review or blocks save.
6. Try duplicate receipt.
7. Confirm duplicate warning.

Expected:
- No receipt can create expenses greater than its own total.
- Taxes and fees are not duplicated as line-item expenses.

### Script H: Notes With Photos

1. Add note to job.
2. Attach photo.
3. Save.
4. Reopen job dashboard.
5. Edit note.
6. Confirm existing photo loads.

Expected:
- Note text and photo persist.
- Financial totals do not change.

### Script I: Payments

1. Add payment.
2. Confirm recent activity.
3. Confirm financial summary.
4. Edit payment amount/date/note.
5. Confirm invoice/report update.

Expected:
- Payments affect paid/balance totals only.

### Script J: Exports

1. Create fixed bid invoice.
2. Export/share PDF on phone.
3. Export/print on web.
4. Export job report.
5. Export receipt photos.

Expected:
- Filenames use uppercase `Invoice` and `Report`.
- Documents have no debug/browser chrome.
- Receipt photos export separately.

## Bug Triage Rules

Blocker:
- Cannot sign in.
- Cannot create/open jobs.
- Financial totals are wrong.
- Receipt save can exceed receipt total.
- User can see another user's data.
- App crashes on core workflows.

High:
- Receipt parser fails common receipts.
- Camera/upload broken on phone.
- Manual expense not included in totals.
- Hours rates produce wrong labor cost.
- Invoice/report export broken.

Medium:
- Confusing copy, rough layout, missing empty state.
- Export formatting is awkward but data is correct.
- Non-core screen navigation issue.

Low:
- Minor visual polish.
- Spacing/copy issues that do not block comprehension.

## Automation Roadmap

The repo does not currently have a test runner configured. Add automation in this order.

### Automation Tier 1: Pure Logic Unit Tests

Add a lightweight TypeScript test runner such as Vitest once we are ready.

Target tests:
- Labor time display formatting.
- Money formatting and parsing helpers.
- Receipt assigned-total guard.
- Tax allocation.
- Non-purchase receipt line filtering.
- Job report date/vendor grouping.
- Invoice totals.
- Fixed bid vs T&M card health logic.

Why first:
- These catch bad math without needing a browser, phone, camera, or Supabase.

### Automation Tier 2: Data Mapper Tests

Mock Supabase responses and test:
- Job financial snapshot mapping.
- Job activity grouping.
- Manual expense creation payload.
- Receipt assignment expense creation payload.
- Tools / Inventory view mapping.
- Crew member loading/default selection.

### Automation Tier 3: Web Smoke Tests

Use a browser automation tool after the app has stable selectors/test IDs.

Target flows:
- Sign in.
- Create job.
- Add manual expense.
- Add hours.
- Add payment.
- Add note.
- Upload receipt with mocked parser response.
- Open invoice/report screens.

### Automation Tier 4: Mobile Manual Or Device Tests

Keep these manual until the product stabilizes:
- Camera permission.
- Photo library permission.
- Native share sheet.
- Expo Go network behavior.
- Small phone layout.

## Test Pass Template

Use this when recording a full pass:

```txt
Date:
Tester:
Git branch / commit:
Supabase project:
Edge Function version:
Web URL:
Mobile device:

Release gates:
- Typecheck:
- Lint:
- Migrations:
- Functions:
- Storage:

Smoke:
- Web:
- Mobile:

Core workflows:
- Auth:
- Jobs:
- Dashboard:
- Receipts:
- Manual expenses:
- Tools / Inventory:
- Hours:
- Payments:
- Notes/photos:
- Invoice:
- Job report:

Security:
- Second user isolation:
- Storage privacy:

Open bugs:
1.
2.
3.

Ship decision:
- Ship:
- Hold:
- Retest needed:
```

## Ship Decision

Ship only when:

- All release gates pass.
- Level 1 through Level 5 pass.
- Level 6 passes for the target platforms being shipped.
- No blocker or high severity bug remains.
- Any medium severity bugs are documented and accepted.
