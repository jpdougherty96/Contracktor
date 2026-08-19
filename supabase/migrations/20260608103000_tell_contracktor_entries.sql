create table if not exists public.tell_contracktor_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.default_business_for_user(auth.uid()) references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  raw_text text not null,
  cleaned_note text,
  extraction jsonb not null default '{}'::jsonb,
  status text not null default 'processed',
  created_note_id uuid references public.job_notes(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint tell_contracktor_entries_raw_text_check check (length(trim(raw_text)) > 0),
  constraint tell_contracktor_entries_status_check check (status in ('needs_job', 'processed', 'failed'))
);

alter table public.tell_contracktor_entries enable row level security;

grant select, insert, update, delete on public.tell_contracktor_entries to authenticated;

create index if not exists tell_contracktor_entries_business_created_idx
on public.tell_contracktor_entries (business_id, created_at desc);

create index if not exists tell_contracktor_entries_job_created_idx
on public.tell_contracktor_entries (job_id, created_at desc);

create or replace function public.set_tell_contracktor_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is null then
    new.business_id := public.default_business_for_user(new.owner_id);
  end if;

  if new.created_by_user_id is null then
    new.created_by_user_id := coalesce(auth.uid(), new.owner_id);
  end if;

  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists set_tell_contracktor_owner_columns on public.tell_contracktor_entries;
create trigger set_tell_contracktor_owner_columns
before insert or update on public.tell_contracktor_entries
for each row execute function public.set_tell_contracktor_owner_columns();

drop policy if exists "Business members can read tell conTRACKtor entries" on public.tell_contracktor_entries;
create policy "Business members can read tell conTRACKtor entries"
on public.tell_contracktor_entries
for select
to authenticated
using (public.user_is_business_member(business_id));

drop policy if exists "Business members can create tell conTRACKtor entries" on public.tell_contracktor_entries;
create policy "Business members can create tell conTRACKtor entries"
on public.tell_contracktor_entries
for insert
to authenticated
with check (
  public.user_is_business_member(business_id)
  and auth.uid() = owner_id
  and (
    job_id is null
    or exists (
      select 1
      from public.jobs j
      where j.id = job_id
        and j.business_id = tell_contracktor_entries.business_id
    )
  )
);

drop policy if exists "Business members can update tell conTRACKtor entries" on public.tell_contracktor_entries;
create policy "Business members can update tell conTRACKtor entries"
on public.tell_contracktor_entries
for update
to authenticated
using (public.user_is_business_member(business_id))
with check (public.user_is_business_member(business_id));
