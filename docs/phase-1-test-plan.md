# conTRACKtor Phase 1 Test Plan

Phase 1 promise: capture the job, track the money, and do not lose billable work.

This plan is intentionally flow-based. A feature is not shippable until the happy path, bad data path, and cross-screen regression checks pass.

## Release Gates

- `npx tsc --noEmit` passes.
- `npm run lint` passes or has documented non-blocking warnings.
- Web smoke test passes on `npm run web`.
- Mobile smoke test passes on `npx expo start`.
- Supabase migrations are applied in the target environment.
- Receipt parser Edge Function is deployed in the target environment.

## 1. Auth And Home

Happy path:
- User can open the app and reach the home actions screen after auth.
- Home shows the warm conTRACKtor direction.
- Home routes to job dashboard, add receipt, add hours, add payment, add note, and create job.

Edge cases:
- Logged-out user sees auth state instead of crashing.
- Supabase auth/network error shows a useful error.
- Logout returns user to auth state.

Regression checks:
- User email is not over-prominent on the dashboard.
- Back navigation returns to the expected previous screen.

## 2. Jobs

Happy path:
- User can create a job with job name, client, location, quote amount, material budget, labor hours, optional hourly rate, and time clock setting.
- Created job appears in Open jobs.
- User can open a job dashboard.
- User can edit job basics and estimates.
- User can change job status to completed/closed and see it move out of Open jobs.

Edge cases:
- Missing required fields block save with a clear message.
- Invalid numeric fields block save.
- Empty optional estimates are accepted.
- Very long job/client/location text does not break the card layout.

Regression checks:
- Job dashboard cards do not show profit, margin, quote, payments, exact receipt totals, exact labor hours, or invoice details.
- Cards show status, triage label, material usage, labor usage, and one reason only when needed.
- New jobs with no activity show `Ready to track`, not `On track`.
- Missing budgets show calm fallback text.

## 3. Job Plan

Happy path:
- Add job plan opens with existing job estimates prefilled.
- Estimated labor hours comes from the job if no saved plan exists.
- Estimated material cost comes from the job and displays as currency.
- Estimated other cost uses existing sub + misc estimates when no saved plan exists.
- User can edit and save scope, assumptions, exclusions, estimates, and phases.
- Saved job plan values take precedence when reopening.

Edge cases:
- Currency values with `$` and commas save correctly.
- Invalid estimate values block save.
- Blank optional fields save as empty/null.

Regression checks:
- Job plan changes do not break job dashboard financials.
- Original Picture panel reflects saved job plan data.

## 4. Receipts And Expenses

Happy path:
- User can start receipt capture from camera as the primary action.
- User can upload a receipt image.
- Parser extracts vendor, date, total, tax when available, and line items.
- Clean single-job receipt can auto-save.
- Single-job line-item receipt shows lightweight total confirmation.
- Multi-job receipt requires line-item assignment before save.
- Confirmed receipt lines create expenses used in job costs.
- Saved line-item receipt can be reopened and edited.

Edge cases:
- Duplicate receipt detection warns before creating duplicates.
- Parser failure gives a manual fallback path.
- Receipt with no line items can still be handled for a single job.
- Multi-job receipt with no line items cannot be saved incorrectly as one job.
- Line item totals that do not match receipt total are clearly handled.
- User can cancel review without creating partial financial records.

Regression checks:
- Receipt source document remains separate from parsed line-item facts.
- Expenses remain the financial truth for job costs.
- Ignored items do not count toward material cost.
- Tools / inventory bucket does not incorrectly attach costs to a job.

## 5. Hours

Happy path:
- User can manually add hours to a job.
- User can set worker, date, hours, hourly rate, and description.
- Reviewed time entries count toward labor used.
- User can edit an existing hours entry from recent activity.
- Optional time clock can start/stop for a job when enabled.

Edge cases:
- Invalid hours or hourly rate block save.
- Zero or negative time is rejected.
- Time clock cannot create duplicate active entries for the same job.
- Time clock survives refresh/reopen state if currently supported.

Regression checks:
- Labor budget usage uses hours against estimated labor hours.
- Labor cost drill-down shows reviewed labor entries.

## 6. Payments

Happy path:
- User can add a customer payment to a job.
- Payment appears in recent activity.
- User can edit a payment.
- Job financial snapshot reflects payments received.

Edge cases:
- Invalid payment amount blocks save.
- Blank optional note/method fields do not crash.
- Payment date handling is stable across web/mobile.

Regression checks:
- Payments do not affect material or labor budget usage.
- Dashboard cards do not show payment totals.

## 7. Notes And Photos

Happy path:
- User can add a note to a job.
- User can attach a photo to a note.
- Note appears in recent activity.
- User can edit an existing note.

Edge cases:
- Photo permission denied shows a useful path forward.
- Upload failure does not lose the typed note.
- Long note text displays without breaking recent activity.

Regression checks:
- Notes/photos do not affect financial calculations.
- Note photo attachment policies work for the owning user only.

## 8. Budget Pulse

Happy path:
- Material usage is actual material spend divided by estimated material budget.
- Labor usage is actual logged hours divided by estimated labor hours.
- Healthy active jobs with activity and budgets show `On track`.
- New active jobs with no activity show `Ready to track`.
- Labor or materials at 80-99% show the correct watch state.
- Labor or materials over 100% show `Over budget`.
- Missing active budgets show `Missing budget`.

Edge cases:
- Missing material budget only affects material row.
- Missing labor budget only affects labor row.
- Both warning states pick one clear label and one reason.
- Over-budget state beats watch state.

Regression checks:
- Budget pulse does not use profit, margin, payments, or invoice details.
- Dashboard card remains compact on mobile widths.

## 9. Job Snapshot

Happy path:
- Job dashboard shows recent receipts, hours, payments, and notes.
- Labor and material cost drill-downs open and close.
- Snapshot fields load from Supabase when available.
- Local fallback values render when database snapshot is unavailable.

Edge cases:
- Empty job shows useful empty states.
- Failed snapshot load shows error without blocking rest of screen.
- Failed activity load shows error without breaking financial panels.

Regression checks:
- AI/generated summary, if added, summarizes confirmed facts only.
- Detail screens remain the source for full financial context.

## 10. Deployment Smoke

Web:
- `npm run web` starts successfully.
- Dashboard loads.
- Create job works.
- Receipt upload path opens.
- Job detail opens.

Mobile:
- `npx expo start` starts successfully.
- Camera permission flow works.
- Image picker flow works.
- Keyboard entry works for job, hours, payment, and note forms.

Supabase:
- `supabase db push` is clean for target project.
- `supabase gen types` is current after migrations.
- `supabase functions deploy extract-receipt` succeeds.
- Authenticated user can read/write only their own records.

## Automation Priority

Start with low-cost tests that catch financial regressions before adding full app automation.

Tier 1:
- Unit tests for budget pulse labels and percentages.
- Unit tests for financial snapshot math.
- Unit tests for receipt total parsing/formatting helpers.
- Unit tests for job plan estimate fallback behavior.

Tier 2:
- Integration tests for Supabase mapping helpers where logic is local and mockable.
- Receipt review state tests for one-job, single-job line-item, multi-job, duplicate, and saved receipt edit paths.
- Hours/payment/note form validation tests.

Tier 3:
- Web smoke tests for the critical path: create job, open dashboard, add plan, add hours, add payment, add note.
- Receipt upload/review smoke tests with fixed sample images or mocked parser responses.
- Mobile manual smoke test for camera and image picker permissions.

Do not automate broad visual coverage yet. First automate the calculations and branching logic that can silently corrupt job costs.
