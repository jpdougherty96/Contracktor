-- Keep receipt review consistently business-scoped while upload remains owner-scoped.

drop policy if exists "Business members can read receipt photos" on storage.objects;
create policy "Business members can read receipt photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.receipts receipt
    where receipt.storage_path = storage.objects.name
      and public.user_is_business_member(receipt.business_id)
  )
);
