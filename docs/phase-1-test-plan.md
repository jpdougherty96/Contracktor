# conTRACKtor Phase 1 Test Plan

Phase 1 promise: capture the job, track the money, and do not lose billable work.

This plan reflects the current routed app, not older experiments. The old standalone Job Plan flow still exists in code, but it is not part of the active Phase 1 navigation. Job setup, budgets, crew, invoices, reports, receipts, manual expenses, hours, payments, notes, and Tools / Inventory are the active test surface.

For the fuller ship-readiness regime, including test pass levels, manual scripts, bug severity rules, and automation roadmap, see [testing-regime.md](testing-regime.md).

## Release Gates

- `npx tsc --noEmit` passes.
- `npm run lint` passes or has documented non-blocking warnings.
- `npm run web` starts and the web app passes the smoke test.
- `npx expo start` starts and the Expo Go mobile smoke test passes.
- `supabase db push` is clean for the target project.
- `supabase migration list` shows local and remote migrations aligned.
- `supabase functions deploy extract-receipt` has been run after parser changes.
- Supabase Storage buckets and policies exist for `receipts` and `attachments`.
- Test with at least one new user or clean account before shipping.

## Test Data To Create

Create these jobs so every important branch is covered:

- Fixed bid job with quote, material budget, labor hour budget, hourly rate, other estimated costs, and two crew members.
- Time & materials job with labor billing rate and at least one crew member.
- Basic job with no budgets yet.
- Job with receipt-backed materials.
- Job with manual expenses.
- Job with payments, notes, note photos, and hours.
- Tools / Inventory expenses with no job attached.

Use at least these receipt cases:

- Clean one-job receipt with no duplicate.
- Receipt with line items and tax.
- Multi-job receipt with line-item assignment.
- Mixed job plus Tools / Inventory receipt.
- Duplicate receipt.
- Bad parse or receipt where line-item total would exceed receipt total.
- Receipt where parser sees subtotal/tax/total/payment lines and must not turn them into expenses.

## 1. Auth And Home

Happy path:
- User can sign up with email, password, name, and optional company.
- User can log in and reach Home.
- Home uses the warm conTRACKtor visual direction.
- Home routes to jobs, add expense, add hours, create job, add note, add payment, and Tools / Inventory.
- The account icon opens account options and does not immediately log out.
- Log out intentionally returns to auth.

Edge cases:
- Wrong password shows a useful error.
- Logged-out app state does not crash.
- App handles missing Supabase env values with a clear config error.

Regression checks:
- User email is not over-prominent in the main dashboard area.
- Back navigation returns to the expected prior screen.

## 2. Job Creation, Editing, And Cards

Happy path:
- Create a fixed bid job.
- Create a time & materials job.
- Create a job with basics only.
- Job basics save: name, client, location, status.
- Fixed bid budget fields save: quote amount, material budget, labor hours, hourly rate, other costs.
- Quote helper markup fills the quote amount and remains editable.
- Time & materials setup saves the labor billing rate.
- Current user can be included as the default crew member.
- Additional crew members and hourly rates can be added.
- Created jobs appear in Open jobs.
- Edit job updates basics, type, budgets/rates, time clock setting, status, and crew.
- Completed/closed jobs move out of Open jobs.

Edge cases:
- Missing required fields block save.
- Bad currency and number values block save.
- Optional budget fields can be blank.
- Very long job, client, and location text does not break card layout.
- Switching job type does not erase unrelated values unless explicitly changed.

Regression checks:
- Job cards stay compact and triage-focused.
- Fixed bid cards show material and labor budget usage when budgets exist.
- T&M cards show tracked labor/material totals rather than fixed-bid budget percentages.
- New jobs with no activity show `Ready to track`, not `On track`.
- Jobs with receipts, manual expenses, or hours no longer show `Ready to track`.
- Dashboard cards do not show full financial report fields: profit, margin, exact receipt totals, payment totals, invoices, or projected profit.

## 3. Job Dashboard

Happy path:
- Opening a job shows the financial summary.
- Labor cost drill-down opens and lists labor entries.
- Materials cost drill-down opens and lists material expenses.
- Add update opens actions for receipt/manual expense, hours, payment, and note.
- Create invoice opens the invoice screen.
- Export job report opens the job report screen.
- Edit job opens and returns to dashboard.
- Recent activity shows receipts, manual expenses, hours, payments, and notes.
- Tapping editable recent activity opens the correct review/edit screen.

Edge cases:
- Empty jobs show useful empty states.
- Failed snapshot/activity load shows an error without crashing the whole screen.
- Manual expense activity has a clear label and no receipt-specific action.

Regression checks:
- Financial totals use `expenses` as the cost truth.
- Receipts remain source documents and line items remain parsed facts.
- Payments do not change material or labor usage.

## 4. Receipt Capture

Happy path:
- Mobile receipt capture offers camera as the primary action.
- Web receipt capture opens a live camera preview first on localhost or HTTPS.
- Web camera preview has a visible `Take photo` button.
- Canceling the web camera opens the existing-photo chooser.
- Captured web photo uploads and calls the same receipt creation/parser flow as uploaded receipts.
- Uploaded receipt image creates a receipt row and storage object.
- Parser extracts vendor, receipt date, subtotal, tax, total, and line items when available.

Edge cases:
- Camera permission denied shows a useful path forward.
- Web camera unavailable falls back gracefully to upload.
- Upload failure does not leave confusing partial UI state.
- Parser failure routes to review/manual correction.

Regression checks:
- Remote Edge Function must be redeployed after parser changes.
- Receipt storage path uses the signed-in user's folder.
- Receipt image previews load from signed URLs.

## 5. Receipt Review, Assignment, And Safeguards

Happy path:
- Clean single-job receipt can save quickly.
- Single-job line-item receipt shows lightweight total confirmation.
- Multi-job receipt requires line-item assignment.
- User can assign line items to one job, another job, Tools / Inventory, or Ignore.
- Mixed job plus Tools / Inventory receipt can save with both destinations.
- Saved receipt can be reopened from recent activity.
- Saved receipt line assignments can be edited.
- User can change the jobs/destinations affiliated with a saved receipt and then redo assignments.
- Duplicate receipt detection warns before creating duplicate expenses.
- User can delete a duplicate/current receipt from review.

Edge cases:
- Multi-job receipt without line items cannot be saved as one job.
- Assigned line totals plus allocated tax cannot exceed receipt total.
- Receipt total mismatch forces review instead of silent save.
- Tax, fees, subtotal, total, payment, card, and rebate lines never become expenses.
- Ignored lines do not create expenses.
- Deleting a receipt deletes associated expenses and storage when applicable.

Regression checks:
- Tax is allocated to item expenses, not duplicated as its own line.
- Tools / Inventory line items create expenses with `job_id = null`.
- Receipt-backed expenses show as receipt-backed in lists and reports.

## 6. Manual Expenses

Happy path:
- User can choose Add expense, then Manual expense.
- Manual job expense saves description, amount, category, date, billable flag, and notes.
- Manual expense appears in job dashboard recent activity.
- Manual expense counts toward job material/labor/expense totals as appropriate.
- Manual Tools / Inventory expense saves without a job.
- Manual Tools / Inventory expense appears in Tools / Inventory.

Edge cases:
- Blank description blocks save.
- Invalid amount blocks save.
- Invalid date blocks save.
- Notes are optional.

Regression checks:
- Manual expenses write to the existing `expenses` table.
- Manual expenses do not create receipt rows.
- Manual expenses have no receipt attached and report cleanly.

## 7. Tools / Inventory

Happy path:
- Home opens Tools / Inventory.
- Tools / Inventory shows total tracked value and expense rows.
- User can add manual Tools / Inventory expense.
- User can pick Tools / Inventory as a receipt destination.
- User can pick Tools / Inventory and one or more jobs together for the same receipt.
- Mixed receipt assignment creates job expenses and Tools / Inventory expenses correctly.

Edge cases:
- Empty Tools / Inventory screen has a useful empty state.
- Inventory-only receipt can be reviewed and saved.
- Inventory-only receipt can be reopened if surfaced from the relevant list/report.

Regression checks:
- Tools / Inventory costs do not inflate a job's material cost.
- Tools / Inventory view only shows current user's unassigned tool/inventory expenses.

## 8. Hours, Crew, And Time Clock

Happy path:
- Add hours from Home by selecting a job.
- Add hours from a job's Add update flow.
- Worker choices appear from the job crew.
- Current user/profile can be the default worker when available.
- Selecting a worker fills worker name and hourly rate.
- Worker name and hourly rate remain editable before save.
- Hours save with date, duration, worker name, hourly rate, and note.
- Hours appear in recent activity and labor drill-down.
- Editing hours updates hours, date, worker name, hourly rate, and note.
- Time clock can start and stop for jobs where it is enabled.

Edge cases:
- Zero, negative, or non-numeric hours are rejected.
- Zero, negative, or non-numeric hourly rate is rejected on add.
- Invalid date is rejected.
- Time clock cannot create duplicate active timers for the same owner.
- Timer stop creates a reasonable duration.

Regression checks:
- Different crew rates produce different labor costs.
- Fixed bid labor budget usage uses hours against estimated labor hours.
- Labor cost uses the hourly rate saved on the time entry.

## 9. Payments

Happy path:
- Add payment from Home by selecting a job.
- Add payment from job Add update.
- Payment saves amount, date, and note.
- Payment appears in recent activity.
- Payment can be edited.
- Job financial summary reflects payments received and balance.
- Invoice and job report include payments.

Edge cases:
- Invalid amount blocks save.
- Invalid date blocks save.
- Blank note is accepted.

Regression checks:
- Payments do not affect material spend, labor spend, or budget usage.
- Job cards do not become payment reports.

## 10. Notes And Photos

Happy path:
- Add note from Home by selecting a job.
- Add note from job Add update.
- Note saves text.
- Note can include one or more photo attachments.
- Note appears in recent activity.
- Note can be edited.
- Existing note photos load from signed URLs.

Edge cases:
- Camera or library permission denied is handled.
- Photo upload failure does not lose typed note text.
- Long note text does not break the dashboard.

Regression checks:
- Notes and attachments do not affect financial calculations.
- Attachment storage policies only allow the owning user.

## 11. Invoice Draft

Happy path:
- Job dashboard opens Create invoice.
- Fixed bid invoice shows contract/quote amount, payments received, and balance due.
- Time & materials invoice shows labor, materials, payments, and billable amount where supported.
- Invoice note is editable.
- Copy text works where supported.
- Mobile PDF/share flow works on a phone.
- Web PDF/print flow works on PC.
- Default filename is `[Job Name] Invoice.pdf` with uppercase `Invoice`.

Edge cases:
- Invoice handles no payments.
- Invoice handles no hours or no materials.
- Long job/client/location text exports cleanly.

Regression checks:
- Invoice remains a draft/preview, not a full invoice management system.
- No invoice statuses, payment links, tax engine, or accounting integrations are introduced.
- No `Invoice draft` title appears at the top of exported invoices.

## 12. Job Report

Happy path:
- Job dashboard opens Export job report.
- Report includes Summary, Job Info, Budget / Quote, Receipts / Expenses, Labor, Payments, and Notes.
- Summary appears at the top.
- Balance label says `Balance due` for fixed bid reports.
- Labor time under 1 hour displays as minutes.
- Receipt expenses are grouped by date and vendor.
- Receipt group shows category totals, group total, and compact line rows.
- Manual expenses appear alongside other expenses.
- Empty sections say `None logged.`
- Web PDF export has no browser print chrome.
- Mobile PDF/share flow works on a phone.
- Default filename is `[Job Name] Report.pdf` with uppercase `Report`.
- Export receipt photos works as a separate action.

Edge cases:
- Job with many receipt line items remains reasonably compact.
- Job with no receipts still exports.
- Job with note photos still exports report data without breaking.
- Receipt file note appears at most once under Receipts / Expenses.

Regression checks:
- Footer appears once at the bottom, not between sections.
- Location formatting uses readable commas.
- Report is contractor-facing and does not become a customer invoice.
- Saved labor hour values are not rounded or mutated; only display formatting changes.

## 13. Web / PC Usability

Happy path:
- `npm run web` starts.
- App loads on PC browser.
- Auth, Home, Jobs, Dashboard, Create job, Add expense, Add hours, Add payment, Add note, Tools / Inventory, Invoice, and Report screens are usable with mouse and keyboard.
- Receipt upload works from PC.
- Receipt camera capture works in a browser on localhost or HTTPS.
- Print/PDF paths work where browser support allows.

Edge cases:
- Narrow browser width still resembles mobile layout.
- Long forms scroll correctly.
- Floating continue/save actions remain reachable.
- Browser refresh during local navigation returns to a stable app state or auth/home.

Regression checks:
- Web capture still calls the Edge Function.
- Web layout does not hide primary buttons below the viewport.

## 14. Mobile / Expo Go Usability

Happy path:
- `npx expo start` starts.
- Expo Go can open the app from the local network QR code.
- Camera capture works for receipts.
- Upload from photo library works.
- Manual forms behave correctly with the mobile keyboard.
- Native PDF share works for invoice and job report.
- Note photo capture/upload works.

Edge cases:
- Permission denial for camera/photo library is recoverable.
- App remains usable on small iPhone dimensions.
- Buttons are not hidden behind keyboard or safe area.

Regression checks:
- Receipt capture is camera-primary on mobile and web.
- Export/share flows use phone-native sharing where available.

## 15. Supabase, Security, And Deployment

Happy path:
- Local and remote migrations match.
- Generated database types are current.
- `extract-receipt` function is active on the target project.
- `OPENAI_API_KEY` is set for the Edge Function.
- `receipts` private bucket exists.
- `attachments` private bucket exists.
- Authenticated user can read/write their own rows.
- A second test user cannot read the first user's jobs, receipts, expenses, notes, attachments, payments, hours, or crew.

Edge cases:
- Edge Function returns a useful error when OpenAI fails.
- Storage signed URL failures show a useful UI error.
- RLS blocks invalid cross-user writes.

Regression checks:
- Recent parser safeguards are deployed, not just present locally.
- Tools / Inventory view respects owner isolation.
- Receipt and attachment storage paths start with the owner id.

## 16. Known Scope And Deferred Features

Not Phase 1:
- Full invoice management.
- Invoice statuses, due dates, payment links, tax engine, recurring invoices, or accounting integrations.
- Gmail, calendar, Zoom, phone logs, geolocation, or automatic change order detection.
- Ask-your-jobs search.
- Inventory ledger.
- Advanced AI job health.
- Store pricing integrations.
- Standalone Job Plan workflow unless it is intentionally re-enabled.

Watch before shipping:
- The Job Plan screen/lib still exist but are not routed in the active app.
- Supabase README mentions receipt storage but should be kept current for attachment storage too.
- Edge Function deploy requires a Supabase access token in the developer environment.

## Suggested Test Order

1. Run release gates: typecheck, lint, web start, migration list, function list.
2. Smoke test auth and home.
3. Create fixed bid, T&M, and no-budget jobs.
4. Test job cards and dashboard empty states.
5. Add manual expenses to a job and Tools / Inventory.
6. Add crew-based hours and payments.
7. Add notes with photos.
8. Test receipt upload/camera on web and mobile.
9. Test receipt review branches: single-job, multi-job, mixed inventory, duplicate, over-total, tax/fee filtering.
10. Verify financial totals and recent activity after each saved record.
11. Export invoice and job report on web.
12. Export invoice and job report from phone.
13. Test RLS with a second user.
14. Re-run typecheck/lint after any fixes.

## Automation Priority

Start by automating the calculations and branching logic that can silently corrupt job costs.

Tier 1:
- Budget pulse labels and percentages.
- Fixed bid vs T&M dashboard card display logic.
- Labor time display formatting.
- Receipt assigned-total guard.
- Tax allocation and tax/fee/subtotal/total line filtering.
- Invoice total calculations.
- Job report grouping by date/vendor.

Tier 2:
- Form validation for job, manual expense, hours, payments, and notes.
- Receipt review state tests for one-job, single-job line-item, multi-job, inventory, duplicate, and saved edit paths.
- Supabase mapper tests with mocked responses.

Tier 3:
- Web smoke test for create job, add manual expense, add hours, add payment, add note, receipt upload, invoice export, and report export.
- Mobile manual smoke test for camera, image picker, keyboard forms, and native share.

Do not automate broad visual coverage first. The highest risk is bad financial data, not minor visual drift.
