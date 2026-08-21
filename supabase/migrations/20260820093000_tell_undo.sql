-- Tell Undo is an audited reversal, not a blind delete. It removes only records
-- that still match the reviewed commit so a later human correction always wins.

alter table public.tell_contracktor_commits
add column if not exists status text not null default 'committed',
add column if not exists undone_at timestamptz,
add column if not exists undone_by_user_id uuid references public.profiles(id) on delete set null,
add column if not exists undo_result jsonb;

alter table public.tell_contracktor_commits
drop constraint if exists tell_contracktor_commits_status_check;

alter table public.tell_contracktor_commits
add constraint tell_contracktor_commits_status_check
check (status in ('committed', 'undone'));

alter table public.tell_contracktor_entries
drop constraint if exists tell_contracktor_entries_status_check;

alter table public.tell_contracktor_entries
add constraint tell_contracktor_entries_status_check
check (status in ('needs_job', 'processed', 'failed', 'undone'));

-- Preserve the proven commit implementation behind a wrapper that prevents an
-- undone interpretation from masquerading as committed on a later retry.
alter function public.commit_tell_contracktor_entry(uuid, jsonb)
rename to commit_tell_contracktor_entry_once;

revoke all on function public.commit_tell_contracktor_entry_once(uuid, jsonb)
from public, anon, authenticated;

create or replace function public.commit_tell_contracktor_entry(
  p_entry_id uuid,
  p_proposals jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_status text;
begin
  select status
  into v_entry_status
  from public.tell_contracktor_entries
  where id = p_entry_id;

  if v_entry_status = 'undone' then
    raise exception 'This Tell update was undone. Send it again to create a new reviewed update.';
  end if;

  return public.commit_tell_contracktor_entry_once(p_entry_id, p_proposals);
end;
$$;

revoke all on function public.commit_tell_contracktor_entry(uuid, jsonb) from public, anon;
grant execute on function public.commit_tell_contracktor_entry(uuid, jsonb) to authenticated;

create or replace function public.undo_tell_contracktor_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_commit public.tell_contracktor_commits;
  v_record jsonb;
  v_proposal jsonb;
  v_record_id uuid;
  v_record_type text;
  v_job_id uuid;
  v_attachment_paths jsonb := '[]'::jsonb;
  v_undo_result jsonb;
begin
  if v_auth_user is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_commit
  from public.tell_contracktor_commits
  where entry_id = p_entry_id
  for update;

  if v_commit.entry_id is null then
    raise exception 'Tell commit not found.';
  end if;

  if not public.user_is_business_member(v_commit.business_id)
    or not public.business_has_feature(v_commit.business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;

  if v_commit.committed_by_user_id <> v_auth_user
    and not public.user_can_manage_business(v_commit.business_id) then
    raise exception 'Only the person who approved this update or a business manager can undo it.';
  end if;

  if v_commit.status = 'undone' then
    return jsonb_set(
      coalesce(v_commit.undo_result, jsonb_build_object('entry_id', p_entry_id)),
      '{replayed}',
      'true'::jsonb,
      true
    );
  end if;

  select coalesce(jsonb_agg(a.storage_path order by a.created_at), '[]'::jsonb)
  into v_attachment_paths
  from public.attachments a
  where a.note_id in (
    select (record ->> 'record_id')::uuid
    from jsonb_array_elements(v_commit.result -> 'records') as record
    where record ->> 'type' = 'note'
  );

  -- Validate the complete commit before deleting anything. The transaction
  -- would roll back on a later failure, but a separate validation pass makes
  -- the human-correction rule explicit.
  for v_record in
    select value from jsonb_array_elements(v_commit.result -> 'records')
  loop
    v_record_id := (v_record ->> 'record_id')::uuid;
    v_record_type := v_record ->> 'type';
    v_job_id := (v_record ->> 'job_id')::uuid;

    select value
    into v_proposal
    from jsonb_array_elements(v_commit.proposal_payload)
    where value ->> 'id' = v_record ->> 'proposal_id';

    if v_proposal is null then
      raise exception 'Tell commit provenance is incomplete; undo was stopped.';
    end if;

    if v_record_type = 'note' and exists (
      select 1 from public.job_notes where id = v_record_id
    ) and not exists (
      select 1
      from public.job_notes n
      where n.id = v_record_id
        and n.business_id = v_commit.business_id
        and n.job_id = v_job_id
        and n.note = trim(v_proposal ->> 'note')
    ) then
      raise exception 'A Tell-created note was edited after approval. Edit or delete it directly instead.';
    elsif v_record_type = 'shopping' and exists (
      select 1 from public.shopping_needs where id = v_record_id
    ) and not exists (
      select 1
      from public.shopping_needs sn
      where sn.id = v_record_id
        and sn.business_id = v_commit.business_id
        and sn.job_id = v_job_id
        and sn.source_type = 'tell_contracktor'
        and sn.source_id = p_entry_id
        and sn.status = 'open'
        and sn.description = trim(v_proposal ->> 'description')
        and sn.quantity is not distinct from nullif(trim(v_proposal ->> 'quantity'), '')::numeric
        and sn.unit is not distinct from nullif(trim(v_proposal ->> 'unit'), '')
        and sn.updated_at <= v_commit.committed_at + interval '5 seconds'
    ) then
      raise exception 'A Tell-created shopping need changed after approval. Edit or dismiss it directly instead.';
    elsif v_record_type = 'hours' and exists (
      select 1 from public.time_entries where id = v_record_id
    ) and not exists (
      select 1
      from public.time_entries te
      where te.id = v_record_id
        and te.business_id = v_commit.business_id
        and te.job_id = v_job_id
        and te.source = 'tell_contracktor'
        and te.status = 'reviewed'
        and te.duration_minutes = round((v_proposal ->> 'hours')::numeric * 60)::integer
        and te.work_date = (v_proposal ->> 'date')::date
        and te.worker_name is not distinct from nullif(trim(v_proposal ->> 'worker_name'), '')
        and te.description is not distinct from nullif(trim(v_proposal ->> 'note'), '')
        and te.updated_at <= v_commit.committed_at + interval '5 seconds'
    ) then
      raise exception 'Tell-created hours changed after approval. Edit or delete them directly instead.';
    elsif v_record_type not in ('note', 'shopping', 'hours') then
      raise exception 'Tell commit contains an unsupported record type; undo was stopped.';
    end if;
  end loop;

  for v_record in
    select value from jsonb_array_elements(v_commit.result -> 'records')
  loop
    v_record_id := (v_record ->> 'record_id')::uuid;
    v_record_type := v_record ->> 'type';

    if v_record_type = 'note' then
      delete from public.job_notes
      where id = v_record_id and business_id = v_commit.business_id;
    elsif v_record_type = 'shopping' then
      delete from public.shopping_needs
      where id = v_record_id and business_id = v_commit.business_id;
    else
      delete from public.time_entries
      where id = v_record_id and business_id = v_commit.business_id;
    end if;
  end loop;

  v_undo_result := jsonb_build_object(
    'attachment_storage_paths', v_attachment_paths,
    'entry_id', p_entry_id,
    'records', v_commit.result -> 'records',
    'replayed', false,
    'undone_at', now()
  );

  update public.tell_contracktor_commits
  set
    status = 'undone',
    undone_at = now(),
    undone_by_user_id = v_auth_user,
    undo_result = v_undo_result
  where entry_id = p_entry_id;

  update public.tell_contracktor_entries
  set
    status = 'undone',
    updated_at = now()
  where id = p_entry_id;

  perform public.upsert_activity_event(
    v_commit.business_id,
    v_commit.owner_id,
    v_auth_user,
    v_auth_user,
    null,
    'tell_contracktor_undone',
    'completed',
    'normal',
    'tell_contracktor_entries',
    p_entry_id,
    'Tell update undone',
    'The records from a Tell conTRACKtor update were removed.',
    jsonb_build_object('record_count', jsonb_array_length(v_commit.result -> 'records')),
    now()
  );

  return v_undo_result;
end;
$$;

revoke all on function public.undo_tell_contracktor_entry(uuid) from public, anon;
grant execute on function public.undo_tell_contracktor_entry(uuid) to authenticated;
