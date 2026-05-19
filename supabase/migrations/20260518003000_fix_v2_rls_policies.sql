grant select, insert, update
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.contacts,
  public.jobs,
  public.job_contacts,
  public.job_plans,
  public.receipts,
  public.receipt_line_items,
  public.expenses,
  public.time_entries,
  public.customer_payments,
  public.job_notes,
  public.attachments,
  public.job_activity,
  public.job_snapshots
to authenticated;

grant select
on public.job_financial_snapshots
to authenticated;

drop policy if exists "Users can manage their own job contacts" on public.job_contacts;
drop policy if exists "Users can read their own job contacts" on public.job_contacts;
drop policy if exists "Users can create valid job contacts" on public.job_contacts;
drop policy if exists "Users can update valid job contacts" on public.job_contacts;
drop policy if exists "Users can delete their own job contacts" on public.job_contacts;

create policy "Users can read their own job contacts"
on public.job_contacts
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job contacts"
on public.job_contacts
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  and exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
);

create policy "Users can update valid job contacts"
on public.job_contacts
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
  and exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
);

create policy "Users can delete their own job contacts"
on public.job_contacts
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own job plans" on public.job_plans;
drop policy if exists "Users can read their own job plans" on public.job_plans;
drop policy if exists "Users can create valid job plans" on public.job_plans;
drop policy if exists "Users can update valid job plans" on public.job_plans;
drop policy if exists "Users can delete their own job plans" on public.job_plans;

create policy "Users can read their own job plans"
on public.job_plans
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job plans"
on public.job_plans
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
);

create policy "Users can update valid job plans"
on public.job_plans
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
);

create policy "Users can delete their own job plans"
on public.job_plans
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own receipts" on public.receipts;
drop policy if exists "Users can read their own receipts" on public.receipts;
drop policy if exists "Users can create valid receipts" on public.receipts;
drop policy if exists "Users can update valid receipts" on public.receipts;
drop policy if exists "Users can delete their own receipts" on public.receipts;

create policy "Users can read their own receipts"
on public.receipts
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid receipts"
on public.receipts
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    scan_context_job_id is null
    or exists (select 1 from public.jobs j where j.id = scan_context_job_id and j.owner_id = auth.uid())
  )
);

create policy "Users can update valid receipts"
on public.receipts
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    scan_context_job_id is null
    or exists (select 1 from public.jobs j where j.id = scan_context_job_id and j.owner_id = auth.uid())
  )
);

create policy "Users can delete their own receipts"
on public.receipts
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own receipt line items" on public.receipt_line_items;
drop policy if exists "Users can read their own receipt line items" on public.receipt_line_items;
drop policy if exists "Users can create valid receipt line items" on public.receipt_line_items;
drop policy if exists "Users can update valid receipt line items" on public.receipt_line_items;
drop policy if exists "Users can delete their own receipt line items" on public.receipt_line_items;

create policy "Users can read their own receipt line items"
on public.receipt_line_items
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid receipt line items"
on public.receipt_line_items
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.receipts r where r.id = receipt_id and r.owner_id = auth.uid())
  and (
    assigned_job_id is null
    or exists (select 1 from public.jobs j where j.id = assigned_job_id and j.owner_id = auth.uid())
  )
);

create policy "Users can update valid receipt line items"
on public.receipt_line_items
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.receipts r where r.id = receipt_id and r.owner_id = auth.uid())
  and (
    assigned_job_id is null
    or exists (select 1 from public.jobs j where j.id = assigned_job_id and j.owner_id = auth.uid())
  )
);

create policy "Users can delete their own receipt line items"
on public.receipt_line_items
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own expenses" on public.expenses;
drop policy if exists "Users can read their own expenses" on public.expenses;
drop policy if exists "Users can create valid expenses" on public.expenses;
drop policy if exists "Users can update valid expenses" on public.expenses;
drop policy if exists "Users can delete their own expenses" on public.expenses;

create policy "Users can read their own expenses"
on public.expenses
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid expenses"
on public.expenses
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
  and (receipt_id is null or exists (select 1 from public.receipts r where r.id = receipt_id and r.owner_id = auth.uid()))
  and (
    receipt_line_item_id is null
    or exists (select 1 from public.receipt_line_items li where li.id = receipt_line_item_id and li.owner_id = auth.uid())
  )
);

create policy "Users can update valid expenses"
on public.expenses
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
  and (receipt_id is null or exists (select 1 from public.receipts r where r.id = receipt_id and r.owner_id = auth.uid()))
  and (
    receipt_line_item_id is null
    or exists (select 1 from public.receipt_line_items li where li.id = receipt_line_item_id and li.owner_id = auth.uid())
  )
);

create policy "Users can delete their own expenses"
on public.expenses
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own time entries" on public.time_entries;
drop policy if exists "Users can read their own time entries" on public.time_entries;
drop policy if exists "Users can create valid time entries" on public.time_entries;
drop policy if exists "Users can update valid time entries" on public.time_entries;
drop policy if exists "Users can delete their own time entries" on public.time_entries;

create policy "Users can read their own time entries"
on public.time_entries
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid time entries"
on public.time_entries
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can update valid time entries"
on public.time_entries
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can delete their own time entries"
on public.time_entries
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own customer payments" on public.customer_payments;
drop policy if exists "Users can read their own customer payments" on public.customer_payments;
drop policy if exists "Users can create valid customer payments" on public.customer_payments;
drop policy if exists "Users can update valid customer payments" on public.customer_payments;
drop policy if exists "Users can delete their own customer payments" on public.customer_payments;

create policy "Users can read their own customer payments"
on public.customer_payments
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid customer payments"
on public.customer_payments
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can update valid customer payments"
on public.customer_payments
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can delete their own customer payments"
on public.customer_payments
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own job notes" on public.job_notes;
drop policy if exists "Users can read their own job notes" on public.job_notes;
drop policy if exists "Users can create valid job notes" on public.job_notes;
drop policy if exists "Users can update valid job notes" on public.job_notes;
drop policy if exists "Users can delete their own job notes" on public.job_notes;

create policy "Users can read their own job notes"
on public.job_notes
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job notes"
on public.job_notes
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can update valid job notes"
on public.job_notes
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can delete their own job notes"
on public.job_notes
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own attachments" on public.attachments;
drop policy if exists "Users can read their own attachments" on public.attachments;
drop policy if exists "Users can create valid attachments" on public.attachments;
drop policy if exists "Users can update valid attachments" on public.attachments;
drop policy if exists "Users can delete their own attachments" on public.attachments;

create policy "Users can read their own attachments"
on public.attachments
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid attachments"
on public.attachments
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can update valid attachments"
on public.attachments
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can delete their own attachments"
on public.attachments
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own job activity" on public.job_activity;
drop policy if exists "Users can read their own job activity" on public.job_activity;
drop policy if exists "Users can create valid job activity" on public.job_activity;
drop policy if exists "Users can update valid job activity" on public.job_activity;
drop policy if exists "Users can delete their own job activity" on public.job_activity;

create policy "Users can read their own job activity"
on public.job_activity
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job activity"
on public.job_activity
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can update valid job activity"
on public.job_activity
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
);

create policy "Users can delete their own job activity"
on public.job_activity
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can manage their own job snapshots" on public.job_snapshots;
drop policy if exists "Users can read their own job snapshots" on public.job_snapshots;
drop policy if exists "Users can create valid job snapshots" on public.job_snapshots;
drop policy if exists "Users can update valid job snapshots" on public.job_snapshots;
drop policy if exists "Users can delete their own job snapshots" on public.job_snapshots;

create policy "Users can read their own job snapshots"
on public.job_snapshots
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Users can create valid job snapshots"
on public.job_snapshots
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
);

create policy "Users can update valid job snapshots"
on public.job_snapshots
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid())
);

create policy "Users can delete their own job snapshots"
on public.job_snapshots
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can upload their own receipt photos" on storage.objects;
drop policy if exists "Users can read their own receipt photos" on storage.objects;
drop policy if exists "Users can update their own receipt photos" on storage.objects;
drop policy if exists "Users can delete their own receipt photos" on storage.objects;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = excluded.public;

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

create policy "Users can update their own receipt photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own receipt photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
