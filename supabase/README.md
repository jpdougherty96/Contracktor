# Supabase setup notes

## Receipt storage

Create a private Storage bucket:

- Name: `receipts`
- Public: `false`

Suggested storage policies for authenticated users:

```sql
create policy "Users can upload their own receipt photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read their own receipt photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

The mobile app uploads paths as:

```txt
{auth.uid()}/{job_id}/{timestamp}-{filename}
```

## Receipt table policies

The app needs authenticated users to insert and read their own receipt rows:

```sql
grant select, insert, update, delete
on table public.receipts
to authenticated;

alter table public.receipts enable row level security;

create policy "Users can read their own receipts"
on public.receipts
for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create their own receipts"
on public.receipts
for insert
to authenticated
with check (owner_id = auth.uid());
```

## Edge Function secrets

Set these secrets before deploying `extract-receipt`:

```sh
supabase secrets set OPENAI_API_KEY=your_openai_key
```

The function uses the signed-in user's JWT for receipt reads, storage downloads, and
receipt updates so normal RLS policies still apply. A service role key is not required
for this receipt extraction flow.

Optional model override:

```sh
supabase secrets set OPENAI_RECEIPT_MODEL=gpt-5.4-mini
```

`SUPABASE_URL` is available in hosted Supabase Edge Functions by default.

## Deploy

```sh
supabase functions deploy extract-receipt --project-ref spdhsfkiejdrctclbudv
```
