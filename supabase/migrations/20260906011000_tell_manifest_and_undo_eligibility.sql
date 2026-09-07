-- Give approved Tell submissions a durable, ordered manifest and make the
-- manifest's Undo status authoritative for both the UI and the Undo command.

create or replace function public.tell_record_undo_eligibility(p_entry_id uuid)
returns table (
  record_position bigint,
  proposal_id text,
  record_id uuid,
  record_type text,
  job_id uuid,
  state text,
  undo_blocked boolean,
  blocked_reason_code text,
  blocked_reason text,
  original_payload jsonb,
  current_record jsonb,
  provenance_matches boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_commit public.tell_contracktor_commits;
  v_manifest_record jsonb;
  v_proposal jsonb;
  v_note public.job_notes;
  v_need public.shopping_needs;
  v_hours public.time_entries;
  v_position bigint;
  v_record_id uuid;
  v_record_type text;
  v_job_id uuid;
begin
  if v_auth_user is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_commit
  from public.tell_contracktor_commits
  where entry_id = p_entry_id;

  if v_commit.entry_id is null then
    raise exception 'CTX:Tell commit not found.';
  end if;

  if not public.user_is_business_member(v_commit.business_id)
    or not public.business_has_feature(v_commit.business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;

  for v_manifest_record, v_position in
    select item.value, item.ordinality
    from jsonb_array_elements(coalesce(v_commit.result -> 'records', '[]'::jsonb))
      with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    v_record_id := (v_manifest_record ->> 'record_id')::uuid;
    v_record_type := v_manifest_record ->> 'type';
    v_job_id := nullif(v_manifest_record ->> 'job_id', '')::uuid;

    select item.value into v_proposal
    from jsonb_array_elements(coalesce(v_commit.proposal_payload, '[]'::jsonb)) as item(value)
    where item.value ->> 'id' = v_manifest_record ->> 'proposal_id'
    limit 1;

    record_position := v_position;
    proposal_id := v_manifest_record ->> 'proposal_id';
    record_id := v_record_id;
    record_type := v_record_type;
    job_id := v_job_id;
    original_payload := v_proposal;
    current_record := null;
    state := 'unchanged';
    undo_blocked := false;
    blocked_reason_code := null;
    blocked_reason := null;
    provenance_matches := true;

    if v_proposal is null then
      state := 'provenance_incomplete';
      undo_blocked := true;
      blocked_reason_code := 'provenance_incomplete';
      blocked_reason := 'This Tell update is missing its approval details and cannot be undone safely.';
      provenance_matches := false;
      return next;
      continue;
    end if;

    if v_record_type = 'note' then
      v_note := null;
      select * into v_note from public.job_notes where id = v_record_id;
      if not found then
        state := 'missing';
        provenance_matches := false;
      else
        current_record := jsonb_strip_nulls(jsonb_build_object(
          'note', v_note.note,
          'note_type', v_note.note_type
        ));
        provenance_matches := v_note.business_id = v_commit.business_id
          and v_note.job_id = v_job_id;

        if exists (
          select 1 from public.attachments attachment
          where attachment.note_id = v_record_id
            and attachment.storage_path not like '%/' || p_entry_id::text || '-%'
            and not exists (
              select 1 from public.tell_contracktor_attachments source
              where source.entry_id = p_entry_id
                and source.storage_path = attachment.storage_path
            )
        ) then
          state := 'photo_added';
          undo_blocked := true;
          blocked_reason_code := 'photo_added';
          blocked_reason := 'A photo was added to this Tell-created note. Edit or delete the note directly instead.';
        elsif not provenance_matches or v_note.note <> trim(v_proposal ->> 'note') then
          state := case when not provenance_matches then 'provenance_changed' else 'changed_since_approval' end;
          undo_blocked := true;
          blocked_reason_code := state;
          blocked_reason := 'This Tell-created note changed after approval. Edit or delete it directly instead.';
        end if;
      end if;
    elsif v_record_type = 'shopping' then
      v_need := null;
      select * into v_need from public.shopping_needs where id = v_record_id;
      if not found then
        state := 'missing';
        provenance_matches := false;
      else
        current_record := jsonb_strip_nulls(jsonb_build_object(
          'description', v_need.description,
          'normalized_name', v_need.normalized_name,
          'quantity', v_need.quantity,
          'unit', v_need.unit,
          'status', v_need.status,
          'needed_by', v_need.needed_by
        ));
        provenance_matches := v_need.business_id = v_commit.business_id
          and v_need.job_id = v_job_id
          and v_need.source_type = 'tell_contracktor'
          and v_need.source_id = p_entry_id;

        if v_need.status = 'fulfilled' then
          state := 'fulfilled';
          undo_blocked := true;
          blocked_reason_code := 'fulfilled';
          blocked_reason := 'This Tell-created shopping item was purchased after approval and cannot be removed with the whole update.';
        elsif v_need.status = 'dismissed' then
          state := 'dismissed';
          undo_blocked := true;
          blocked_reason_code := 'dismissed';
          blocked_reason := 'This Tell-created shopping item was dismissed after approval. Manage it directly instead.';
        elsif not provenance_matches
          or v_need.status <> 'open'
          or v_need.description <> trim(v_proposal ->> 'description')
          or v_need.quantity is distinct from nullif(trim(v_proposal ->> 'quantity'), '')::numeric
          or v_need.unit is distinct from nullif(trim(v_proposal ->> 'unit'), '')
          -- This timestamp catches invoicing and other state-only mutations that
          -- leave all of the proposal's user-facing content unchanged.
          or v_need.updated_at > v_commit.committed_at + interval '5 seconds'
        then
          state := case when not provenance_matches then 'provenance_changed' else 'changed_since_approval' end;
          undo_blocked := true;
          blocked_reason_code := state;
          blocked_reason := 'This Tell-created shopping item changed after approval. Edit or dismiss it directly instead.';
        end if;
      end if;
    elsif v_record_type = 'hours' then
      v_hours := null;
      select * into v_hours from public.time_entries where id = v_record_id;
      if not found then
        state := 'missing';
        provenance_matches := false;
      else
        current_record := jsonb_strip_nulls(jsonb_build_object(
          'duration_minutes', v_hours.duration_minutes,
          'hours', v_hours.duration_minutes::numeric / 60,
          'work_date', v_hours.work_date,
          'worker_name', v_hours.worker_name,
          'note', v_hours.description,
          'status', v_hours.status,
          'invoice_id', v_hours.invoice_id,
          'invoiced_at', v_hours.invoiced_at
        ));
        provenance_matches := v_hours.business_id = v_commit.business_id
          and v_hours.job_id = v_job_id
          and v_hours.source = 'tell_contracktor';

        if v_hours.invoice_id is not null then
          state := 'invoiced';
          undo_blocked := true;
          blocked_reason_code := 'invoiced';
          blocked_reason := 'These Tell-created hours have been invoiced and cannot be removed with the whole update.';
        elsif not provenance_matches
          or v_hours.status <> 'reviewed'
          or v_hours.duration_minutes <> round((v_proposal ->> 'hours')::numeric * 60)::integer
          or v_hours.work_date <> (v_proposal ->> 'date')::date
          or v_hours.worker_name is distinct from nullif(trim(v_proposal ->> 'worker_name'), '')
          or v_hours.description is distinct from nullif(trim(v_proposal ->> 'note'), '')
          -- Do not remove this: invoice attribution and other state-only changes
          -- advance updated_at without changing the compared Tell content.
          or v_hours.updated_at > v_commit.committed_at + interval '5 seconds'
        then
          state := case when not provenance_matches then 'provenance_changed' else 'changed_since_approval' end;
          undo_blocked := true;
          blocked_reason_code := state;
          blocked_reason := 'These Tell-created hours changed after approval. Edit or delete them directly instead.';
        end if;
      end if;
    else
      state := 'unsupported';
      undo_blocked := true;
      blocked_reason_code := 'unsupported';
      blocked_reason := 'This Tell update contains an unsupported record type and cannot be undone safely.';
      provenance_matches := false;
    end if;

    return next;
  end loop;
end;
$$;

create or replace function public.get_tell_contracktor_manifest(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.tell_contracktor_entries;
  v_commit public.tell_contracktor_commits;
  v_records jsonb := '[]'::jsonb;
  v_blocked_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;

  select * into v_entry from public.tell_contracktor_entries where id = p_entry_id;
  if v_entry.id is null then raise exception 'CTX:Tell submission not found.'; end if;
  if not public.user_is_business_member(v_entry.business_id)
    or not public.business_has_feature(v_entry.business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;

  select * into v_commit from public.tell_contracktor_commits where entry_id = p_entry_id;
  if v_commit.entry_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'position', eligibility.record_position,
      'proposal_id', eligibility.proposal_id,
      'record_id', eligibility.record_id,
      'type', eligibility.record_type,
      'job_id', eligibility.job_id,
      'job_name', job.name,
      'state', eligibility.state,
      'undo_blocked', eligibility.undo_blocked,
      'blocked_reason_code', eligibility.blocked_reason_code,
      'blocked_reason', eligibility.blocked_reason,
      'original', eligibility.original_payload,
      'current', eligibility.current_record,
      'provenance_matches', eligibility.provenance_matches
    ) order by eligibility.record_position), '[]'::jsonb),
    (array_agg(eligibility.blocked_reason order by eligibility.record_position)
      filter (where eligibility.undo_blocked))[1]
    into v_records, v_blocked_reason
    from public.tell_record_undo_eligibility(p_entry_id) eligibility
    left join public.jobs job on job.id = eligibility.job_id;
  end if;

  return jsonb_build_object(
    'entry_id', v_entry.id,
    'status', v_entry.status,
    'submitted_at', v_entry.created_at,
    'commit_status', v_commit.status,
    'committed_at', v_commit.committed_at,
    'records', v_records,
    'undo_allowed', v_commit.entry_id is not null
      and v_commit.status <> 'undone'
      and v_blocked_reason is null,
    'undo_blocked_reason', case
      when v_commit.status = 'undone' then 'This Tell update has already been undone.'
      else v_blocked_reason
    end
  );
end;
$$;

-- The public Undo wrapper uses the same eligibility rows returned to the UI,
-- preventing a badge from claiming Undo is safe when the mutation will refuse.
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
  v_commit_status text;
  v_activity_job_id uuid;
  v_undo_result jsonb;
  v_cleanup_paths jsonb;
  v_blocked record;
begin
  if v_auth_user is null then raise exception 'Authentication is required.'; end if;

  select business_id, result, status
  into v_business_id, v_commit_result, v_commit_status
  from public.tell_contracktor_commits
  where entry_id = p_entry_id
  for update;

  if v_business_id is null then raise exception 'CTX:Tell commit not found.'; end if;
  if not public.user_is_business_member(v_business_id)
    or not public.business_has_feature(v_business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;

  if v_commit_status <> 'undone' then
    select * into v_blocked
    from public.tell_record_undo_eligibility(p_entry_id)
    where undo_blocked
    order by record_position
    limit 1;
    if found then raise exception 'CTX:%', v_blocked.blocked_reason; end if;
  end if;

  select case
    when count(*) > 0
      and count(*) = count(nullif(records.record ->> 'job_id', ''))
      and count(distinct records.record ->> 'job_id') = 1
    then min(records.record ->> 'job_id')::uuid else null::uuid end
  into v_activity_job_id
  from jsonb_array_elements(coalesce(v_commit_result -> 'records', '[]'::jsonb)) records(record);

  -- _once remains a second safety boundary. Translate its historical messages
  -- without editing migration history; the paired boundary test requires this
  -- list to remain identical to the guarded raises in 20260820093000.
  begin
    v_undo_result := public.undo_tell_contracktor_entry_once(p_entry_id);
  exception when others then
    if sqlerrm in (
      'Tell commit provenance is incomplete; undo was stopped.',
      'A Tell-created note was edited after approval. Edit or delete it directly instead.',
      'A Tell-created shopping need changed after approval. Edit or dismiss it directly instead.',
      'Tell-created hours changed after approval. Edit or delete them directly instead.',
      'Tell commit contains an unsupported record type; undo was stopped.'
    ) then raise exception 'CTX:%', sqlerrm; end if;
    raise;
  end;

  update public.activity_events set job_id = v_activity_job_id
  where business_id = v_business_id and event_type = 'tell_contracktor_undone'
    and source_table = 'tell_contracktor_entries' and source_id = p_entry_id;

  select coalesce(jsonb_agg(paths.value), '[]'::jsonb) into v_cleanup_paths
  from jsonb_array_elements_text(coalesce(v_undo_result -> 'attachment_storage_paths', '[]'::jsonb)) paths(value)
  where not exists (
    select 1 from public.tell_contracktor_attachments source
    where source.entry_id = p_entry_id and source.storage_path = paths.value
  );

  return jsonb_set(v_undo_result, '{attachment_storage_paths}', v_cleanup_paths, true);
end;
$$;

revoke all on function public.tell_record_undo_eligibility(uuid) from public, anon;
grant execute on function public.tell_record_undo_eligibility(uuid) to authenticated;
revoke all on function public.get_tell_contracktor_manifest(uuid) from public, anon;
grant execute on function public.get_tell_contracktor_manifest(uuid) to authenticated;
revoke all on function public.undo_tell_contracktor_entry(uuid) from public, anon;
grant execute on function public.undo_tell_contracktor_entry(uuid) to authenticated;
