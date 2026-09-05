# Developing Free and Pro Safely

conTRACKtor uses one codebase and one deployable app. Free and Pro are selected
at runtime from each business's effective feature entitlements. Do not maintain
separate long-lived Free and Pro branches.

## Two Backends

Since September 1, 2026 there are two Supabase projects:

- **Live** holds the beta users and is what contracktor.app talks to. It is not a
  development target. Do not run migrations, deploy functions, or edit rows there
  outside a deliberate release.
- **Development** is a separate project that local Expo, the Supabase CLI link, and
  Vercel previews point at. Every instruction below that says to edit rows or flip a
  plan means this project.

Confirm which project ref you are pointed at before any database work. Local Expo
loads `.env.local` ahead of `.env`, so `.env.local` is what actually decides.

- Application work happens on a short-lived `codex/` or developer branch.
- Local Expo reads the development project URL and public key from `.env.local`.
- Start Expo Go with `npm start`; start the browser version with `npm run web`.
- Never place a service-role key or database password in an `EXPO_PUBLIC_`
  variable.

Even with the environments split, backend changes reach the deployed client
before new application code does whenever a migration is released ahead of a
build. Backend changes must therefore remain backward-compatible. Prefer
additive tables, columns, functions, feature keys, and policies. Do not remove
or rename a contract until every deployed client has moved away from it.

## Real Free and Pro Accounts

Use two real accounts in the **development** project:

1. Keep one business assigned to `free` with no overrides.
2. Assign the other business to `pro`.

New accounts automatically receive a business, owner membership, and active
Free subscription. No repository script generates test users or stores their
passwords.

To find the two businesses in the Supabase Dashboard:

1. Open **Authentication > Users** and copy the account's user ID.
2. Open **Table Editor > businesses** and find the row whose `owner_id` equals
   that user ID. Copy its business `id`.
3. Open **subscription_plans** and note the `id` for the `free` or `pro` row.
4. Open **business_subscriptions**, find the matching `business_id`, and set
   `plan_id` to the chosen plan's ID. Keep `status` set to `active`.

The same change can be made in the SQL Editor. Replace the email and plan key:

```sql
update public.business_subscriptions bs
set
  plan_id = p.id,
  status = 'active'
from public.subscription_plans p,
     public.businesses b,
     auth.users u
where bs.business_id = b.id
  and b.owner_id = u.id
  and lower(u.email) = lower('ACCOUNT_EMAIL')
  and p.plan_key = 'pro';
```

Use `p.plan_key = 'free'` to return the account to the Free baseline.

## Verification

Run the same core workflow checklist in both accounts. Then verify:

- Free can use jobs, financials, hours/time clock, receipts, existing receipt
  extraction and reconciliation, expenses, payments, notes/photos,
  invoices/reports, Shopping, Activity/required attention, and basic Tell.
- Free has no smart receipt allocation, proactive intelligence, or AI Snapshot
  interpretation entry point.
- Direct paid operations are rejected by the server for Free.
- Pro exposes intelligence capabilities such as smart receipt allocation,
  higher Tell/AI usage, AI Snapshot interpretation, and proactive warnings.
- A Pro failure does not block sign-in or any existing Free workflow.
- Downgrading Pro to Free preserves read/export access to historical records.

Automated tier-boundary checks remain available with:

```sh
npm run test:tiers
```

## Release Gate

Before merging a tiered change:

- TypeScript, lint, all boundary tests (`npm test`), and the production web build pass.
- The linked migration list is synchronized.
- Backend changes have been reviewed for compatibility with the deployed app.
- Both real accounts pass the Free/Pro checklist above.
- No credential, service-role key, database password, or account password is
  present in the Git diff.

Production application deployment remains a separate, deliberate step from
backend migration and feature-branch review.
