# Developing Free and Pro Safely

conTRACKtor uses one codebase and one deployable app. Free and Pro behavior is
selected at runtime from a business's effective feature entitlements. Do not
maintain separate long-lived Free and Pro branches: they will drift and make a
production regression much more likely.

## Environments

- Production continues to run from `main` and must remain usable throughout
  Pro development.
- Feature work happens on a short-lived `codex/` or developer branch.
- A staging Supabase project is the default backend for tier development.
- Preview deployments point only at staging, never at the production service
  role key.

Database migrations must be backward-compatible with the currently deployed
client before they are applied. Prefer additive tables, columns, functions, and
policies. Remove or rename old contracts only after every active client has
moved away from them.

Create `.staging-secrets/client.config` from `.env.staging.example`, then
launch the app against staging with:

```sh
npm run start:staging
```

Scan that Expo server's QR code with Expo Go. For a staging browser session,
use `npm run web:staging`. Both commands refuse to start if the staging URL
matches the production URL in `.env`.

## Test Businesses

Keep two staging businesses with separate test users:

1. **Free baseline** — assigned to `free` with no overrides.
2. **Pro development** — assigned to `pro`, or Free plus a deliberate beta
   override when testing one feature in isolation.

Run the same core workflow checklist in both businesses. Then run the Pro-only
checks and verify that the corresponding entry points are absent for Free.

The shared staging project is `contracktor-staging`
(`wdcyjppumkhqxithcplu`). Generate or refresh its two confirmed test accounts
with `npm run staging:seed-users`. Their emails, generated passwords, user IDs,
and business IDs are written only to `.staging-secrets/test-users.env`.

Verify authentication, resolved plans, Free core writes, and paid enforcement:

```sh
npm run staging:verify-tiers
```

## Switching a Staging Business

The repository includes a guarded administrative helper. It reads the ignored
`.staging-secrets/admin.env` file created during setup:

```sh
npm run dev:set-plan -- --business BUSINESS_UUID --plan pro
```

Use `--plan free` to return the business to the Free baseline. The helper only
accepts `free` or `pro`, requires staging-named environment variables, and
refuses to run if the staging project reference/URL do not match or if staging
matches `.env` production. Service-role credentials
belong in the shell or a private staging secret store; never put them in an
`EXPO_PUBLIC_` variable or commit them.

## Release Gate

Before merging a tiered change:

- TypeScript, lint, and the web production build pass.
- Database changes pass a migration dry run against staging.
- Free can sign in and complete jobs, financials, hours/time clock, receipts,
  current extraction, expenses, payments, notes/photos, and invoices/reports.
- Free has no Activity, Shopping, Tell, or smart-allocation entry point.
- Direct paid operations are rejected by the server for Free.
- Pro can use each newly enabled feature.
- Temporarily blocking entitlement lookup leaves Free core available and hides
  Pro features.
- Downgrading Pro to Free preserves read/export access to historical records.

Only after these checks should the branch be reviewed and merged. Production
database and Edge Function deployment remains a separate, deliberate release
step from application code review.
