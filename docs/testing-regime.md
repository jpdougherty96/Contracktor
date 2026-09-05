# conTRACKtor App Testing Regime

This is the repeatable test regime for conTRACKtor. Its first purpose is to let
the product owner test the production app without developer tools. The final
section contains the developer release gates.

The product promise under test is:

> A contractor can capture what happened on a job and understand the
> operational and financial truth of that job.

Financial truth is the hard gate. A rough layout can be logged and fixed later;
wrong costs, duplicated records, lost source evidence, or data crossing between
users stop a release.

## Which Test To Run

| Test | When | Time | Where |
| --- | --- | ---: | --- |
| Smoke test | After every production deployment | 5 minutes | Desktop and phone |
| Core job loop | Weekly and before any demo | 20-30 minutes | Production |
| Full release test | Before calling a milestone complete | 45-60 minutes | Production, desktop and phone |

If a change touches receipts, Tell, hours, timers, or job totals, run the Core
Job Loop even if the change looked small.

## Safe Test Setup

Use fake data only. Never test with a real customer's name, address, receipt,
or payment information.

For each test pass, create one job with these values:

```txt
Job name: TEST — YYYY-MM-DD — your initials
Client: Test Client
Location: Test Site
Job type: Time & materials
Crew member: yourself
Hourly cost rate: $50.00
```

Keep the name beginning with `TEST —` so test records are unmistakable. Use the
same job for the entire pass. At the end, archive the job; do not leave it mixed
in with active work.

Use the reusable fake receipt at
[test-fixtures/acceptance-receipt.png](test-fixtures/acceptance-receipt.png).
It is deliberately marked as a test receipt and contains:

```txt
Merchandise:   $500.00
Sales tax:      $20.00
Store credit: -$100.00
Amount paid:   $420.00
```

The amount paid is the real material cost. The app must not mistake the $520
pre-credit total for the cost.

## 1. Five-Minute Smoke Test

Run this immediately after every production deployment.

| # | Action | Expected result |
| ---: | --- | --- |
| 1 | Open `https://app.contracktor.app/` in a private/incognito window. | The app loads with no blank screen or error page. |
| 2 | Sign in. | Home opens and the session is for the correct account. |
| 3 | Check Home. | Capture Receipt, Tell conTRACKtor, and Start Work are visible and usable. |
| 4 | Open Jobs, then open one existing job. | The job and Job Snapshot load without an error. |
| 5 | Return Home and open Activity/Needs Attention. | Existing items load and no real item has changed. |
| 6 | Refresh the page. | The session and current data persist. |
| 7 | Repeat steps 1-5 on a phone. | Controls fit the screen; nothing important is hidden by the keyboard or safe area. |

Pass only if every row succeeds. If sign-in, navigation, or any job data fails,
stop and log a release-blocking bug.

## 2. Core Job Loop

This is the standard product acceptance test. Run the steps in order and check
the exact expected numbers.

### A. Create the test job

1. Create the Time & materials job described in **Safe Test Setup**.
2. Add yourself as crew with an hourly cost rate of `$50.00`.
3. Save, leave the job, and reopen it.

Expected:

- The job appears in Jobs.
- Client, location, job type, crew, and rate persist after reopening.
- The empty Job Snapshot does not invent customer revenue or balance.

### B. Test the work timer

1. From Home, choose **Start Work**.
2. Select the test job and yourself.
3. Confirm the displayed rate is `$50.00`.
4. Start the timer, wait a few seconds, then stop it.

Expected:

- Start changes to an active Stop state.
- The timer remains active while navigating away and back.
- Stopping produces one time record, not two.
- A very short timer may round to zero billable minutes. That is acceptable;
  the exact financial check uses manual hours next.

### C. Add exact labor

1. Add a manual hours entry for `0.1 hours` at `$50.00/hour`.
2. Save and reopen the job.

Expected:

- Hours include the new `0.1` entry.
- Recorded labor cost is exactly `$5.00`.
- The source hours record appears in job history/activity.

### D. Tell conTRACKtor, approve, and undo

1. Tell conTRACKtor: `Add a note to this job: acceptance test note.`
2. Review the proposal before approving it.
3. Approve it.
4. Confirm the note appears under the correct test job.
5. Undo the Tell update.

Expected:

- Nothing is committed before approval.
- Approval creates one note under the selected job.
- Retry/navigation does not create a duplicate.
- Undo removes the committed note.
- Activity preserves an audit event showing what happened and associates it
  with the correct test job.

### E. Capture and reconcile the receipt

1. Choose **Capture Receipt** and upload
   [the fake receipt](test-fixtures/acceptance-receipt.png).
2. Assign it to the test job.
3. Wait for extraction to finish.
4. Review every extracted value. Correct any uncertain or missing field.
5. Save the reviewed receipt.

Expected:

- The original receipt image remains available as source evidence.
- Merchandise is `$500.00`.
- Tax is `$20.00`.
- Store credit is `$100.00`.
- Amount paid and recorded material cost are exactly `$420.00`.
- Tax, total, and payment rows are not duplicated as additional expenses.
- The receipt appears once in the correct job history.

Receipt extraction is allowed to ask for review. It is not allowed to silently
save the wrong financial truth.

### F. Reconcile the Job Snapshot

Open the test job and compare the source records with the Snapshot.

| Value | Expected |
| --- | ---: |
| Manual hours | 0.1 h |
| Labor cost | $5.00 |
| Material cost | $420.00 |
| Total recorded cost | $425.00 |

The numbers must reconcile exactly:

```txt
0.1 hours × $50.00 = $5.00 labor
$500.00 merchandise + $20.00 tax - $100.00 credit = $420.00 materials
$5.00 labor + $420.00 materials = $425.00 total recorded cost
```

Refresh the page and reopen the job. All source records and all four values
must remain unchanged.

### G. Clean up

1. Archive the test job through the normal app flow.
2. Confirm it leaves the active Jobs list and remains available in history.
3. Do not resolve, dismiss, edit, or delete pre-existing real Needs Attention
   items during testing.

The Core Job Loop passes only when sections A-G all pass and the Snapshot total
is exactly `$425.00`.

## 3. Full Release Test

Run the Smoke Test and Core Job Loop first, then add the tests below.

### Account and persistence

- Sign out intentionally and sign back in.
- Close and reopen the browser/app.
- Confirm the same jobs and source records remain.
- Confirm the account menu does not sign out merely by opening it.

### Corrections

- Edit the test hours from `0.1` to `0.2`; labor must change from `$5.00` to
  `$10.00` once and only once.
- Correct one reviewed receipt field, save, refresh, and confirm it persists.
- Change the hours back to `0.1` before the final `$425.00` reconciliation.
- Edit a record created by Tell, then try Tell Undo. Undo must not erase a
  later human correction without warning.

### Duplicate protection

- Upload the fake receipt a second time.
- The app must warn or block before creating a second `$420.00` material cost.
- If a duplicate test receipt record is created during the test, remove only
  that test duplicate through the normal app UI.

### Needs Attention

- Use a test-only Tell statement that should create an uncertainty or follow-up.
- Confirm it appears once, links to the correct test job, and explains what
  needs review.
- Resolve the test item and confirm it leaves the required-attention list while
  its history remains understandable.

### Job types

- Create a small Fixed bid test job with a `$1,000.00` quote.
- Add `$100.00` of recorded cost.
- Confirm the deterministic profit view is `$900.00` before any other costs.
- Confirm a Time & materials job does **not** invent a customer balance before
  invoicing or a recorded balance event.

### Phone-specific behavior

- Capture a receipt with the phone camera.
- Upload a receipt from the phone photo library.
- On the deployed web app, confirm **Capture receipt** opens the camera first.
- Cancel the web camera and confirm the existing-photo chooser opens.
- Use Tell with the phone keyboard open.
- Start and stop work on the phone.
- Confirm save/review buttons remain visible and tappable.
- Rotate the phone once and confirm no data is lost.

### Two-user isolation (release candidate only)

Use a second test account. Verify that it cannot see or change the first test
account's jobs, receipts, receipt images, hours, notes, activity, or attention
items. Any cross-account visibility is an immediate stop-ship issue.

## Test Result Record

Create one result record per test pass. Copy this template into the release
issue, project notes, or a dated Markdown file:

```txt
Date and time:
Tester:
Production URL:
Build/commit, if known:
Desktop browser:
Phone and browser/PWA:

Smoke test: PASS / FAIL
Core job loop: PASS / FAIL / NOT RUN
Full release test: PASS / FAIL / NOT RUN

Final expected total: $425.00
Final actual total:

Failures:
1.
2.

Ship decision: SHIP / HOLD / RETEST
```

For each failure, capture:

```txt
Short title:
Time observed:
Device/browser:
Job name:
Exact steps:
Expected:
Actual:
Screenshot or screen recording:
Did a refresh change it?:
```

Do not keep retrying until a bug disappears. Retry once to determine whether it
is repeatable, record both outcomes, and preserve the test job for diagnosis.

## Severity and Ship Rules

### Stop ship

- Sign-in is unavailable.
- A user can see or change another user's data.
- A source record is lost or assigned to the wrong job.
- Financial totals are wrong or cannot be reconciled.
- A receipt creates duplicate cost or cost above the amount actually paid.
- Tell commits an unapproved change or Undo deletes a later human correction.
- The app crashes or blocks job creation, receipt capture, hours, or Snapshot.

### Fix before release

- A core action works only after unexplained retries.
- Camera/library capture is broken on the target phone.
- Important controls are hidden or unreachable.
- Activity or Needs Attention points to the wrong job.
- Corrections do not persist after refresh.

### May ship when documented

- Minor spacing, copy, or visual polish problems.
- A non-core empty state is awkward but understandable.
- A cosmetic problem has no effect on source truth, math, or task completion.

A release can ship only when:

- Smoke passes on both desktop and phone.
- Core Job Loop passes with exactly `$425.00` total recorded cost.
- No Stop ship or Fix before release issue remains.
- Any accepted cosmetic issue is written down.

## Developer Release Gates

These supplement the owner's app test; they do not replace it.

Run from the repository:

```sh
npx tsc --noEmit
npm run lint
npm test
npm run build:web
supabase migration list
supabase functions list
```

Required state:

- TypeScript, lint, tests, and production build pass.
- Local and remote migrations match.
- `process-receipt-queue` and `tell-contracktor` are active at their intended
  versions, and the retired `extract-receipt` function is absent.
- Receipt and attachment storage remain private.
- Production environment secrets are present.
- The production deployment is the intended commit.
- The product owner completes the Smoke Test after deployment.

Receipt financial-integrity changes also require `npm run test:integration`
against a dedicated local/test Supabase project. Never run the integration
suite against production because it deliberately creates and removes test
users and financial records. The Quality workflow runs the same integration
suite automatically against an ephemeral local Supabase stack.

The narrower scripts in [phase-1-test-plan.md](phase-1-test-plan.md) remain useful
for feature-specific regression work, but this document governs the final
owner acceptance decision.
