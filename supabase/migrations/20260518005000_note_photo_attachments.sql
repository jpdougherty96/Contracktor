alter table public.attachments
add column if not exists note_id uuid references public.job_notes(id) on delete cascade;

create index if not exists attachments_note_id_idx
on public.attachments (note_id);

drop policy if exists "Users can create valid attachments" on public.attachments;
drop policy if exists "Users can update valid attachments" on public.attachments;

create policy "Users can create valid attachments"
on public.attachments
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
  and (note_id is null or exists (select 1 from public.job_notes n where n.id = note_id and n.owner_id = auth.uid()))
);

create policy "Users can update valid attachments"
on public.attachments
for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = auth.uid()))
  and (note_id is null or exists (select 1 from public.job_notes n where n.id = note_id and n.owner_id = auth.uid()))
);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own attachments" on storage.objects;
drop policy if exists "Users can read their own attachments" on storage.objects;
drop policy if exists "Users can update their own attachments" on storage.objects;
drop policy if exists "Users can delete their own attachments" on storage.objects;

create policy "Users can upload their own attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can read their own attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update their own attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete their own attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);
