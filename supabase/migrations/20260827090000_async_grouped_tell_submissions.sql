-- Tell submissions are durable source records. AI processing happens after the
-- source is secured, and every proposed record stays grouped under that source.

create extension if not exists pgmq;

alter table public.tell_contracktor_entries
add column if not exists local_date date not null default current_date,
add column if not exists processing_started_at timestamptz,
add column if not exists processing_attempts integer not null default 0,
add column if not exists last_processing_error text,
add column if not exists processed_at timestamptz,
add column if not exists reviewed_at timestamptz;

alter table public.tell_contracktor_entries
drop constraint if exists tell_contracktor_entries_status_check;

alter table public.tell_contracktor_entries
add constraint tell_contracktor_entries_status_check
check (status in (
  'uploading', 'queued', 'processing', 'ready_review', 'needs_info', 'approved',
  'failed', 'dismissed', 'undone', 'needs_job', 'processed'
));

create index if not exists tell_contracktor_entries_processing_idx
on public.tell_contracktor_entries (status, created_at)
where status in ('queued', 'processing');

create table if not exists public.tell_contracktor_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.tell_contracktor_entries(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  file_type text not null default 'image/jpeg',
  created_at timestamptz not null default now(),
  constraint tell_contracktor_attachments_storage_unique unique (storage_path)
);

alter table public.tell_contracktor_attachments enable row level security;
grant select, insert on public.tell_contracktor_attachments to authenticated;
grant all on public.tell_contracktor_attachments to service_role;

create policy "Business members can read Tell attachments"
on public.tell_contracktor_attachments
for select to authenticated
using (public.user_is_business_member(business_id));

create policy "Users can create their Tell attachments"
on public.tell_contracktor_attachments
for insert to authenticated
with check (
  auth.uid() = owner_id
  and public.user_is_business_member(business_id)
  and exists (
    select 1 from public.tell_contracktor_entries entry
    where entry.id = tell_contracktor_attachments.entry_id
      and entry.business_id = tell_contracktor_attachments.business_id
      and entry.owner_id = auth.uid()
  )
);

create index if not exists tell_contracktor_attachments_entry_idx
on public.tell_contracktor_attachments (entry_id, created_at);

create table if not exists public.tell_contracktor_proposals (
  entry_id uuid not null references public.tell_contracktor_entries(id) on delete cascade,
  proposal_id text not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  proposal_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  reviewed_payload jsonb,
  record_table text,
  record_id uuid,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entry_id, proposal_id),
  constraint tell_contracktor_proposals_type_check
    check (proposal_type in ('note', 'shopping', 'hours')),
  constraint tell_contracktor_proposals_status_check
    check (status in ('pending', 'approved', 'dismissed')),
  constraint tell_contracktor_proposals_payload_check
    check (jsonb_typeof(payload) = 'object')
);

alter table public.tell_contracktor_proposals enable row level security;
grant select on public.tell_contracktor_proposals to authenticated;
grant all on public.tell_contracktor_proposals to service_role;

create policy "Business members can read Tell proposals"
on public.tell_contracktor_proposals
for select to authenticated
using (public.user_is_business_member(business_id));

create index if not exists tell_contracktor_proposals_entry_status_idx
on public.tell_contracktor_proposals (entry_id, status, created_at);

do $$
begin
  if not exists (select 1 from pgmq.meta where queue_name = 'tell_processing') then
    perform pgmq.create('tell_processing');
  end if;
end;
$$;

create or replace function public.finalize_tell_submission(p_entry_id uuid)
returns public.tell_contracktor_entries
language plpgsql
security definer
set search_path = public, pgmq, extensions
as $$
declare
  v_entry public.tell_contracktor_entries;
begin
  select * into v_entry
  from public.tell_contracktor_entries
  where id = p_entry_id
  for update;

  if v_entry.id is null then
    raise exception 'Tell submission not found.';
  end if;

  if auth.uid() is null or v_entry.owner_id <> auth.uid()
    or not public.user_is_business_member(v_entry.business_id) then
    raise exception 'You cannot submit this Tell update.';
  end if;

  if v_entry.status in ('queued', 'processing', 'ready_review', 'needs_info', 'approved') then
    return v_entry;
  end if;

  update public.tell_contracktor_entries
  set status = 'queued', last_processing_error = null, updated_at = now()
  where id = p_entry_id
  returning * into v_entry;

  perform pgmq.send('tell_processing', jsonb_build_object('entry_id', p_entry_id));
  return v_entry;
end;
$$;

revoke all on function public.finalize_tell_submission(uuid) from public, anon;
grant execute on function public.finalize_tell_submission(uuid) to authenticated;

create or replace function public.claim_tell_processing_jobs(
  p_limit integer default 2,
  p_visibility_timeout integer default 300
)
returns table (msg_id bigint, entry_id uuid)
language sql
security definer
set search_path = public, pgmq, extensions
as $$
  select queued.msg_id, (queued.message ->> 'entry_id')::uuid
  from pgmq.read(
    'tell_processing',
    greatest(coalesce(p_visibility_timeout, 300), 30),
    least(greatest(coalesce(p_limit, 2), 1), 10)
  ) as queued
  where queued.message ? 'entry_id';
$$;

create or replace function public.delete_tell_processing_job(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pgmq, extensions
as $$ select pgmq.delete('tell_processing', p_msg_id); $$;

create or replace function public.mark_tell_processing(p_entry_id uuid)
returns public.tell_contracktor_entries
language plpgsql
security definer
set search_path = public
as $$
declare v_entry public.tell_contracktor_entries;
begin
  update public.tell_contracktor_entries
  set status = 'processing', processing_started_at = now(),
      processing_attempts = processing_attempts + 1,
      last_processing_error = null, updated_at = now()
  where id = p_entry_id
  returning * into v_entry;
  if v_entry.id is null then raise exception 'Tell submission not found.'; end if;
  return v_entry;
end;
$$;

revoke all on function public.claim_tell_processing_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.delete_tell_processing_job(bigint) from public, anon, authenticated;
revoke all on function public.mark_tell_processing(uuid) from public, anon, authenticated;
grant execute on function public.claim_tell_processing_jobs(integer, integer) to service_role;
grant execute on function public.delete_tell_processing_job(bigint) to service_role;
grant execute on function public.mark_tell_processing(uuid) to service_role;

create or replace function public.review_tell_contracktor_proposals(
  p_entry_id uuid,
  p_proposals jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_entry public.tell_contracktor_entries;
  v_saved public.tell_contracktor_proposals;
  v_existing_commit public.tell_contracktor_commits;
  v_proposal jsonb;
  v_proposal_id text;
  v_kind text;
  v_job_id uuid;
  v_job public.jobs;
  v_record_id uuid;
  v_note_id uuid;
  v_note text;
  v_description text;
  v_normalized_name text;
  v_quantity numeric;
  v_unit text;
  v_hours numeric;
  v_duration_minutes integer;
  v_work_date date;
  v_worker_name text;
  v_new_payload jsonb := '[]'::jsonb;
  v_new_records jsonb := '[]'::jsonb;
  v_all_payload jsonb := '[]'::jsonb;
  v_all_records jsonb := '[]'::jsonb;
  v_remaining integer;
  v_result jsonb;
begin
  if v_auth_user is null then raise exception 'Authentication is required.'; end if;
  if jsonb_typeof(p_proposals) <> 'array' or jsonb_array_length(p_proposals) < 1
    or jsonb_array_length(p_proposals) > 50 then
    raise exception 'Tell approval requires between 1 and 50 proposals.';
  end if;

  select * into v_entry from public.tell_contracktor_entries
  where id = p_entry_id for update;
  if v_entry.id is null then raise exception 'Tell submission not found.'; end if;
  if not public.user_is_business_member(v_entry.business_id)
    or not public.business_has_feature(v_entry.business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;
  if v_entry.status in ('queued', 'processing', 'failed', 'undone', 'dismissed') then
    raise exception 'This Tell submission is not ready for review.';
  end if;

  select * into v_existing_commit from public.tell_contracktor_commits
  where entry_id = p_entry_id for update;
  if v_existing_commit.entry_id is not null and v_existing_commit.status = 'undone' then
    raise exception 'This Tell update was undone. Send it again to create a new reviewed update.';
  end if;

  for v_proposal in select value from jsonb_array_elements(p_proposals)
  loop
    v_proposal_id := nullif(trim(v_proposal ->> 'id'), '');
    v_kind := nullif(trim(v_proposal ->> 'type'), '');
    if v_proposal_id is null or v_kind not in ('note', 'shopping', 'hours') then
      raise exception 'Every Tell proposal requires a valid id and type.';
    end if;

    select * into v_saved from public.tell_contracktor_proposals
    where entry_id = p_entry_id and proposal_id = v_proposal_id for update;
    if v_saved.entry_id is null or v_saved.proposal_type <> v_kind then
      raise exception 'Tell proposal was not found in this submission.';
    end if;
    if v_saved.status = 'dismissed' then raise exception 'This Tell proposal was dismissed.'; end if;
    if v_saved.status = 'approved' then continue; end if;

    begin v_job_id := (v_proposal ->> 'job_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Every Tell proposal requires a valid job id.';
    end;
    select * into v_job from public.jobs
    where id = v_job_id and business_id = v_entry.business_id;
    if v_job.id is null then raise exception 'A Tell proposal job was not found in this business.'; end if;

    if v_kind = 'note' then
      v_note := nullif(trim(v_proposal ->> 'note'), '');
      if v_note is null then raise exception 'Tell note proposals cannot be empty.'; end if;
      insert into public.job_notes (job_id, note, note_type, owner_id)
      values (v_job_id, v_note, 'general', v_auth_user) returning id into v_record_id;
      v_note_id := coalesce(v_note_id, v_record_id);
      insert into public.attachments (
        owner_id, job_id, note_id, storage_path, original_filename, file_type
      )
      select v_auth_user, v_job_id, v_record_id, storage_path, original_filename, file_type
      from public.tell_contracktor_attachments where entry_id = p_entry_id
      on conflict (storage_path) do update set job_id = excluded.job_id, note_id = excluded.note_id;
      perform public.upsert_activity_event(
        v_entry.business_id, v_auth_user, v_auth_user, v_auth_user, v_job_id,
        'note_added', 'completed', 'normal', 'job_notes', v_record_id,
        'Note added', left(v_note, 180),
        jsonb_build_object('source', 'tell_contracktor', 'tell_entry_id', p_entry_id), now()
      );
    elsif v_kind = 'shopping' then
      v_description := nullif(trim(v_proposal ->> 'description'), '');
      v_normalized_name := nullif(trim(v_proposal ->> 'normalized_name'), '');
      v_unit := nullif(trim(v_proposal ->> 'unit'), '');
      v_quantity := nullif(trim(v_proposal ->> 'quantity'), '')::numeric;
      if v_description is null then raise exception 'Tell shopping proposals require a description.'; end if;
      if v_quantity is not null and v_quantity <= 0 then raise exception 'Tell shopping quantities must be greater than zero.'; end if;
      insert into public.shopping_needs (
        description, job_id, normalized_name, owner_id, performed_by_type,
        quantity, source_id, source_type, unit
      ) values (
        v_description, v_job_id, v_normalized_name, v_auth_user, 'ai',
        v_quantity, p_entry_id, 'tell_contracktor', v_unit
      ) returning id into v_record_id;
      perform public.upsert_activity_event(
        v_entry.business_id, v_auth_user, v_auth_user, v_auth_user, v_job_id,
        'shopping_need_created', 'completed', 'normal', 'shopping_needs', v_record_id,
        'Shopping need added', v_description,
        jsonb_build_object('source', 'tell_contracktor', 'tell_entry_id', p_entry_id), now()
      );
    else
      v_hours := nullif(trim(v_proposal ->> 'hours'), '')::numeric;
      v_work_date := coalesce(nullif(trim(v_proposal ->> 'date'), '')::date, current_date);
      v_worker_name := nullif(trim(v_proposal ->> 'worker_name'), '');
      v_note := nullif(trim(v_proposal ->> 'note'), '');
      if v_hours is null or v_hours <= 0 or v_hours > 24 then
        raise exception 'Tell hours must be greater than zero and no more than 24.';
      end if;
      v_duration_minutes := round(v_hours * 60)::integer;
      insert into public.time_entries (
        description, duration_minutes, hourly_rate, job_id, owner_id,
        source, status, work_date, worker_name
      ) values (
        v_note, v_duration_minutes, coalesce(v_job.hourly_rate, 0), v_job_id,
        v_auth_user, 'tell_contracktor', 'reviewed', v_work_date, v_worker_name
      ) returning id into v_record_id;
      perform public.upsert_activity_event(
        v_entry.business_id, v_auth_user, v_auth_user, v_auth_user, v_job_id,
        'hours_logged', 'completed', 'normal', 'time_entries', v_record_id,
        'Hours logged', concat(v_hours, ' hrs', case when v_worker_name is not null then ' - ' || v_worker_name else '' end),
        jsonb_build_object('durationMinutes', v_duration_minutes, 'source', 'tell_contracktor',
          'tell_entry_id', p_entry_id, 'workDate', v_work_date), now()
      );
    end if;

    update public.tell_contracktor_proposals
    set status = 'approved', reviewed_payload = v_proposal,
        record_table = case v_kind when 'note' then 'job_notes' when 'shopping' then 'shopping_needs' else 'time_entries' end,
        record_id = v_record_id, reviewed_by_user_id = v_auth_user,
        reviewed_at = now(), updated_at = now()
    where entry_id = p_entry_id and proposal_id = v_proposal_id;

    v_new_payload := v_new_payload || jsonb_build_array(v_proposal);
    v_new_records := v_new_records || jsonb_build_array(jsonb_build_object(
      'job_id', v_job_id, 'proposal_id', v_proposal_id,
      'record_id', v_record_id, 'type', v_kind
    ));
  end loop;

  v_all_payload := coalesce(v_existing_commit.proposal_payload, '[]'::jsonb) || v_new_payload;
  v_all_records := coalesce(v_existing_commit.result -> 'records', '[]'::jsonb) || v_new_records;
  v_result := jsonb_build_object(
    'created_note_id', coalesce(v_note_id, (v_existing_commit.result ->> 'created_note_id')::uuid),
    'entry_id', p_entry_id, 'records', v_all_records,
    'replayed', jsonb_array_length(v_new_records) = 0
  );

  insert into public.tell_contracktor_commits (
    entry_id, business_id, owner_id, committed_by_user_id, proposal_payload, result
  ) values (
    p_entry_id, v_entry.business_id, v_entry.owner_id, v_auth_user, v_all_payload, v_result
  ) on conflict (entry_id) do update set
    proposal_payload = excluded.proposal_payload,
    result = excluded.result,
    committed_by_user_id = excluded.committed_by_user_id,
    committed_at = now();

  select count(*) into v_remaining from public.tell_contracktor_proposals
  where entry_id = p_entry_id and status = 'pending';

  update public.tell_contracktor_entries
  set created_note_id = coalesce(v_note_id, created_note_id),
      job_id = coalesce(job_id, (v_all_records -> 0 ->> 'job_id')::uuid),
      status = case when v_remaining = 0 then 'approved' else 'ready_review' end,
      reviewed_at = case when v_remaining = 0 then now() else reviewed_at end,
      updated_at = now()
  where id = p_entry_id;

  update public.attention_items
  set status = case when v_remaining = 0 then 'resolved' else 'open' end,
      detail = case when v_remaining = 0 then 'Tell review completed.'
        else concat(v_remaining, case when v_remaining = 1 then ' suggestion remains' else ' suggestions remain' end) end,
      resolved_at = case when v_remaining = 0 then now() else null end,
      resolved_by_user_id = case when v_remaining = 0 then v_auth_user else null end,
      resolution_note = case when v_remaining = 0 then 'All Tell suggestions were resolved.' else null end,
      updated_at = now()
  where source_table = 'tell_contracktor_entries' and source_id = p_entry_id;

  return v_result;
end;
$$;

revoke all on function public.review_tell_contracktor_proposals(uuid, jsonb) from public, anon;
grant execute on function public.review_tell_contracktor_proposals(uuid, jsonb) to authenticated;

create or replace function public.dismiss_tell_contracktor_proposal(
  p_entry_id uuid,
  p_proposal_id text
)
returns public.tell_contracktor_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_entry public.tell_contracktor_entries;
  v_remaining integer;
  v_approved integer;
begin
  select * into v_entry from public.tell_contracktor_entries
  where id = p_entry_id for update;
  if v_auth_user is null or v_entry.id is null
    or not public.user_is_business_member(v_entry.business_id) then
    raise exception 'Tell submission was not found or cannot be reviewed.';
  end if;

  update public.tell_contracktor_proposals
  set status = 'dismissed', reviewed_by_user_id = v_auth_user,
      reviewed_at = now(), updated_at = now()
  where entry_id = p_entry_id and proposal_id = p_proposal_id and status = 'pending';

  if not found then raise exception 'Tell suggestion is no longer pending.'; end if;

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'approved')
  into v_remaining, v_approved
  from public.tell_contracktor_proposals where entry_id = p_entry_id;

  update public.tell_contracktor_entries
  set status = case when v_remaining > 0 then 'ready_review'
                    when v_approved > 0 then 'approved' else 'dismissed' end,
      reviewed_at = case when v_remaining = 0 then now() else reviewed_at end,
      updated_at = now()
  where id = p_entry_id returning * into v_entry;

  update public.attention_items
  set status = case when v_remaining = 0 then 'resolved' else 'open' end,
      detail = case when v_remaining = 0 then 'Tell review completed.'
        else concat(v_remaining, case when v_remaining = 1 then ' suggestion remains' else ' suggestions remain' end) end,
      resolved_at = case when v_remaining = 0 then now() else null end,
      resolved_by_user_id = case when v_remaining = 0 then v_auth_user else null end,
      resolution_note = case when v_remaining = 0 then 'All Tell suggestions were resolved.' else null end,
      updated_at = now()
  where source_table = 'tell_contracktor_entries' and source_id = p_entry_id;

  return v_entry;
end;
$$;

revoke all on function public.dismiss_tell_contracktor_proposal(uuid, text) from public, anon;
grant execute on function public.dismiss_tell_contracktor_proposal(uuid, text) to authenticated;

-- A Tell source photo may also be surfaced on an approved job note, but Undo
-- must never delete the original secured source object.
create or replace function public.undo_tell_contracktor_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_business_id uuid;
  v_commit_result jsonb;
  v_undo_result jsonb;
  v_cleanup_paths jsonb;
begin
  if v_auth_user is null then raise exception 'Authentication is required.'; end if;

  select business_id, result into v_business_id, v_commit_result
  from public.tell_contracktor_commits where entry_id = p_entry_id;
  if v_business_id is null then raise exception 'Tell commit not found.'; end if;
  if not public.user_is_business_member(v_business_id)
    or not public.business_has_feature(v_business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;

  if exists (
    select 1 from public.attachments attachment
    where attachment.note_id in (
      select (record ->> 'record_id')::uuid
      from jsonb_array_elements(v_commit_result -> 'records') as record
      where record ->> 'type' = 'note'
    )
      and attachment.storage_path not like '%/' || p_entry_id::text || '-%'
      and not exists (
        select 1 from public.tell_contracktor_attachments source
        where source.entry_id = p_entry_id
          and source.storage_path = attachment.storage_path
      )
  ) then
    raise exception 'A photo was added to a Tell-created note after approval. Edit or delete that note directly instead.';
  end if;

  v_undo_result := public.undo_tell_contracktor_entry_once(p_entry_id);
  select coalesce(jsonb_agg(path.value), '[]'::jsonb) into v_cleanup_paths
  from jsonb_array_elements_text(
    coalesce(v_undo_result -> 'attachment_storage_paths', '[]'::jsonb)
  ) as path(value)
  where not exists (
    select 1 from public.tell_contracktor_attachments source
    where source.entry_id = p_entry_id and source.storage_path = path.value
  );

  return jsonb_set(v_undo_result, '{attachment_storage_paths}', v_cleanup_paths, true);
end;
$$;

revoke all on function public.undo_tell_contracktor_entry(uuid) from public, anon;
grant execute on function public.undo_tell_contracktor_entry(uuid) to authenticated;

do $$
begin
  perform cron.unschedule('contracktor-process-tell-queue');
exception when others then null;
end;
$$;

select cron.schedule(
  'contracktor-process-tell-queue', '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'contracktor_project_url')
      || '/functions/v1/process-tell-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'contracktor_anon_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'contracktor_anon_key'),
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'receipt_worker_secret')
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);
