# Supabase Setup Notes

conTRACKtor relies on Supabase Auth, Postgres, Storage, and one Edge Function.

Use migrations as the source of truth. The current migrations create the app tables, RLS policies, financial views, `receipts` storage bucket, and `attachments` storage bucket.

## Apply Database Migrations

Push migrations to the target Supabase project:

```sh
supabase db push
```

Verify local and remote migrations match:

```sh
supabase migration list
```

After schema changes, regenerate local database types:

```sh
supabase gen types typescript --project-id spdhsfkiejdrctclbudv --schema public > src/types/database.ts
```

## Storage Buckets

The app uses two private buckets:

- `receipts`: receipt photos uploaded during receipt capture.
- `attachments`: note photo attachments.

Both buckets should be private:

```txt
Public: false
```

The migrations create owner-scoped storage policies so authenticated users can upload, read, update, and delete files under their own user id folder.

Expected receipt paths:

```txt
{auth.uid()}/{job_id-or-tools-inventory}/{timestamp}-{filename}
```

Expected note attachment paths:

```txt
{auth.uid()}/notes/{note_id}/{timestamp}-{filename}
```

Verify buckets in the Supabase Dashboard or with the Supabase CLI before testing photo flows.

## Edge Function Secrets

Set the OpenAI API key before deploying the receipt parser:

```sh
supabase secrets set OPENAI_API_KEY=your_openai_key
```

Optional model override:

```sh
supabase secrets set OPENAI_RECEIPT_MODEL=gpt-5.4-mini
```

`SUPABASE_URL` is available in hosted Supabase Edge Functions by default.

The function uses the signed-in user's JWT for receipt reads, storage downloads, and receipt updates, so normal RLS policies still apply. A service role key is not required for this receipt extraction flow.

## Deploy Receipt Parser

Deploy after any change to `supabase/functions/extract-receipt/index.ts`:

```sh
supabase functions deploy extract-receipt --project-ref spdhsfkiejdrctclbudv
```

Verify the deployed function:

```sh
supabase functions list
```

The recent parser safeguards only run remotely after this deploy. That includes:

- rejecting or flagging parsed line totals that exceed the receipt total
- avoiding subtotal, tax, fee, total, payment, card, and rebate lines as expense line items
- forcing review when receipt totals or line items look unsafe

The app also has client-side save guards, but the cleanest review flow depends on the deployed Edge Function being current.

## Release Verification

Before a test build or release, run:

```sh
npx tsc --noEmit
npm run lint
supabase db push
supabase migration list
supabase functions list
```

Then manually verify:

- `receipts` bucket exists and is private.
- `attachments` bucket exists and is private.
- `extract-receipt` is active.
- Note photo upload works.
- Receipt upload/camera capture works.
- A second user cannot read the first user's jobs, expenses, receipts, notes, attachments, payments, hours, or crew.
