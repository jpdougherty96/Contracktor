# conTRACKtor

conTRACKtor is an Expo / React Native app backed by Supabase for contractors who need to capture job costs, hours, payments, notes, receipts, and basic profitability without turning the app into full accounting software.

Product direction is governed by the [MVP definition](docs/mvp-definition.md),
the [Product Rulebook](docs/product-rulebook.md), and the
[development roadmap](docs/development-roadmap.md).

Phase 1 promise:

```txt
Capture the job. Track the money. Don't lose billable work.
```

## Current Product Scope

The active app covers:

- Supabase email/password auth.
- Home screen with account menu and primary job actions.
- Job creation and editing.
- Fixed bid and time & materials job types.
- Job budgets: material budget, estimated labor hours, hourly rate, other estimated costs, quote amount.
- Quote helper with markup buttons for fixed bid jobs.
- Job crew-member records with individual hourly rates; authenticated multi-user business/team accounts are not yet implemented.
- Open jobs dashboard with triage-style job cards.
- Job detail dashboard with financial summary, labor drill-down, materials drill-down, recent activity, invoices, reports, and editing.
- Receipt capture from mobile camera, mobile library, web upload, and web camera.
- AI receipt parsing through the Supabase Edge Function `extract-receipt`.
- Receipt duplicate detection.
- Receipt line-item review and assignment.
- Multi-job receipt assignment.
- Tools / Inventory receipt assignment.
- Manual expenses when there is no receipt.
- Tools / Inventory expense tracking with no job attached.
- Manual hours.
- Optional time clock per job.
- Manual customer-payment ledger entries; online payment processing is not yet implemented.
- Job notes with photo attachments.
- Basic invoice draft/export.
- Contractor-facing job report export.
- Separate receipt photo export from the job report screen.

The old standalone Job Plan screen/lib still exist but are intentionally deferred and are not routed in the active Phase 1 app. Job setup currently owns budgets, quote, crew, and rates.

## Tech Stack

- Expo SDK 54
- React Native 0.81
- React 19
- Expo Router
- Supabase Auth, Postgres, Storage, and Edge Functions
- TypeScript

## Repo Map

```txt
app/                         Expo Router entry and local screen routing
src/components/              Shared React Native components
src/lib/                     Supabase access, business logic, export helpers
src/screens/                 App screens
src/types/                   Shared app and generated Supabase types
supabase/functions/          Edge Functions, including receipt extraction
supabase/migrations/         Database, RLS, view, and storage migrations
supabase/README.md           Supabase setup/deploy notes
docs/phase-1-test-plan.md    Current Phase 1 manual and automation test plan
docs/product-rulebook.md     Dynamic product rules for UX, AI, and workflow design
docs/development-roadmap.md  Definitive planned sequence for near-term product work
docs/subscription-tiers.md   Free/Pro feature boundary and entitlement rules
docs/tier-development.md     Safe single-project workflow for both plans
```

## Product Rulebook

Workflow and AI-related changes should be evaluated against the [conTRACKtor Product Rulebook](docs/product-rulebook.md).

Core rule:

```txt
Users capture or describe reality. conTRACKtor turns it into records.
```

Before adding a screen, form field, confirmation, required decision, or AI-specific workflow, ask whether conTRACKtor can infer it, automate it, prepare it, defer it, process it in the background, or ask only later if it is genuinely needed.

The planned build sequence is documented in [docs/development-roadmap.md](docs/development-roadmap.md).
The dynamic Free/Pro boundary is documented in [docs/subscription-tiers.md](docs/subscription-tiers.md).

## Prerequisites

- Node.js
- npm
- Expo CLI through `npx expo ...`
- Expo Go on a phone for mobile testing
- Supabase CLI for database/function deployment
- A Supabase project
- An OpenAI API key for receipt parsing

## Environment Variables

Create a local `.env` file with:

```sh
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The app throws a startup error if either value is missing.

Edge Function secrets are managed with Supabase, not the Expo `.env` file. See [supabase/README.md](supabase/README.md).

## Install

```sh
npm install
```

## Run The App

Start for mobile / Expo Go:

```sh
npx expo start
```

Start web for PC/browser use:

```sh
npm run web
```

Expo uses the linked `contracktor-dev` Supabase project configured in `.env`.
See [docs/tier-development.md](docs/tier-development.md) for the Free/Pro
real-account workflow.

Useful Expo options after `npx expo start`:

- scan the QR code with Expo Go for phone testing
- press `w` for web
- press `i` for iOS simulator if available
- press `a` for Android emulator if available

Web camera capture only works on secure browser contexts, such as `localhost` or HTTPS.

## Quality Checks

Run TypeScript:

```sh
npx tsc --noEmit
```

Run lint:

```sh
npm run lint
```

Run boundary tests:

```sh
npm test
```

Start web smoke test:

```sh
npm run web
```

Start mobile smoke test:

```sh
npx expo start
```

The product owner's production smoke, core-job, and release acceptance tests are
in [docs/testing-regime.md](docs/testing-regime.md). Feature-specific regression
coverage remains in [docs/phase-1-test-plan.md](docs/phase-1-test-plan.md).

## Supabase Setup

Supabase setup is migration-driven. The migrations create tables, RLS policies, views, storage buckets, and storage policies.

Push database migrations:

```sh
supabase db push
```

Verify migrations:

```sh
supabase migration list
```

Regenerate database types after schema changes:

```sh
supabase gen types typescript --project-id spdhsfkiejdrctclbudv --schema public > src/types/database.ts
```

The app uses two private storage buckets:

- `receipts`
- `attachments`

For details, see [supabase/README.md](supabase/README.md).

## Web Deployment

The app is configured for static Expo web deployment through Vercel:

- build command: `npm run build:web`
- output directory: `dist`
- config file: `vercel.json`

Custom-domain deployment notes for `contracktor.app` are in [docs/deploy-web.md](docs/deploy-web.md).

## Receipt Parser Edge Function

Receipt parsing runs through:

```txt
supabase/functions/extract-receipt/index.ts
```

Set the OpenAI secret:

```sh
supabase secrets set OPENAI_API_KEY=your_openai_key
```

Optional model override:

```sh
supabase secrets set OPENAI_RECEIPT_MODEL=gpt-5.4-mini
```

Deploy after any parser change:

```sh
supabase functions deploy extract-receipt --project-ref spdhsfkiejdrctclbudv
```

Verify deployment:

```sh
supabase functions list
```

Important: parser safeguards in the local Edge Function do not affect the remote app until the function is deployed. That includes filtering tax/fee/total/payment rows and flagging parsed line totals that exceed the receipt total.

## Financial Model

The app keeps receipt data separated by responsibility:

- Receipts are source documents.
- Receipt line items are parsed facts.
- Expenses are the financial truth used for job costs.

Receipt-backed expenses and manual expenses both write to `expenses`. Manual expenses do not create receipt rows. Tools / Inventory expenses use `job_id = null`.

## Active Workflows To Know

The workflows below describe the current implementation, not necessarily preferred future UX. For new workflow design, the Product Rulebook is authoritative.

Jobs:
- Create fixed bid, time & materials, or basic jobs.
- Add budgets and quote information.
- Add/edit crew members and hourly rates.
- Open jobs appear on the job dashboard.
- Closed/completed jobs move out of Open jobs.

Receipts:
- Add receipt from Home, a job, or Tools / Inventory.
- Select one or more jobs and optionally Tools / Inventory.
- Upload/take a receipt photo.
- Parser extracts fields and line items.
- User reviews duplicates, totals, and line assignments.
- Confirmed lines create expenses.

Manual expenses:
- Add expense without a receipt.
- Save directly to `expenses`.
- Include description, amount, category, date, billable flag, and notes.

Hours:
- Add manual hours.
- Pick a crew member to prefill worker name and hourly rate.
- Edit hours, worker name, hourly rate, date, and note.
- Start/stop time clock when enabled for the job.

Payments:
- Add/edit customer payments.
- Payments affect paid/balance totals but do not affect labor/material costs.

Notes:
- Add/edit notes.
- Attach note photos through the `attachments` bucket.

Exports:
- Create basic invoice draft from job data.
- Export job report from job data.
- Export receipt photos separately from the job report screen.

## Phase 1 Guardrails

Do not turn Phase 1 into a full accounting system.

Not included in Phase 1:

- full invoice management
- invoice statuses, payment links, due-date aging, tax engine, recurring invoices
- QuickBooks/Xero integrations
- Gmail, calendar, Zoom, phone logs, or geolocation integrations
- Ask-your-jobs search
- inventory ledger
- store pricing integrations
- advanced AI job health
- standalone Job Plan workflow

## Before Shipping Or Testing A Build

Run:

```sh
npx tsc --noEmit
npm run lint
npm test
npm run build:web
supabase db push
supabase migration list
supabase functions list
```

Manually verify:

- Web app loads with `npm run web`.
- Phone app loads with `npx expo start` and Expo Go.
- Auth works.
- Create/edit job works.
- Add receipt works on phone.
- Upload receipt works on web.
- Web camera receipt capture works on localhost.
- Manual expense works for a job and Tools / Inventory.
- Hours with crew rates work.
- Payments work.
- Notes with photos work.
- Invoice export works.
- Job report export works.
- Receipt photo export works.
- A second user cannot read the first user's data.

## Common Commands

```sh
npm install
npm run web
npx expo start
npx tsc --noEmit
npm run lint
npm test
npm run build:web
supabase db push
supabase migration list
supabase functions deploy extract-receipt --project-ref spdhsfkiejdrctclbudv
supabase functions list
```
