-- Tell interpretation remains reviewable. Approval crosses one authenticated,
-- transactional server boundary and is safe to retry by entry id.

create table if not exists public.tell_contracktor_commits (
  entry_id uuid primary key references public.tell_contracktor_entries(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  committed_by_user_id uuid not null references public.profiles(id) on delete cascade,
  proposal_payload jsonb not null,
  result jsonb not null,
  committed_at timestamptz not null default now(),
  constraint tell_contracktor_commits_payload_array_check
    check (jsonb_typeof(proposal_payload) = 'array'),
  constraint tell_contracktor_commits_result_object_check
    check (jsonb_typeof(result) = 'object')
);

alter table public.tell_contracktor_commits enable row level security;

grant select on public.tell_contracktor_commits to authenticated;
grant all on public.tell_contracktor_commits to service_role;

create policy "Business members can read Tell commits"
on public.tell_contracktor_commits
for select
to authenticated
using (public.user_is_business_member(business_id));

create index if not exists tell_contracktor_commits_business_committed_idx
on public.tell_contracktor_commits (business_id, committed_at desc);

-- Tell-created time is distinct from manual form entry while retaining the
-- same reviewed status and deterministic costing behavior.
alter table public.time_entries
drop constraint if exists time_entries_source_check;

alter table public.time_entries
add constraint time_entries_source_check
check (source in ('manual', 'timer', 'calendar', 'geo', 'zoom', 'phone', 'tell_contracktor'));

-- A deterministic attachment path allows a successful Tell commit to resume
-- photo uploads without creating duplicate attachment rows.
create unique index if not exists attachments_storage_path_unique
on public.attachments (storage_path);

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
  v_auth_user uuid := auth.uid();
  v_entry public.tell_contracktor_entries;
  v_existing_result jsonb;
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
  v_result_records jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if v_auth_user is null then
    raise exception 'Authentication is required.';
  end if;

  if p_entry_id is null then
    raise exception 'Tell entry id is required.';
  end if;

  if jsonb_typeof(p_proposals) <> 'array'
    or jsonb_array_length(p_proposals) = 0
    or jsonb_array_length(p_proposals) > 50 then
    raise exception 'Tell approval requires between 1 and 50 proposals.';
  end if;

  select *
  into v_entry
  from public.tell_contracktor_entries
  where id = p_entry_id
  for update;

  if v_entry.id is null then
    raise exception 'Tell entry not found.';
  end if;

  if not public.user_is_business_member(v_entry.business_id)
    or not public.business_has_feature(v_entry.business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;

  select result
  into v_existing_result
  from public.tell_contracktor_commits
  where entry_id = p_entry_id;

  if v_existing_result is not null then
    return jsonb_set(v_existing_result, '{replayed}', 'true'::jsonb, true);
  end if;

  if (
    select count(*) <> count(distinct proposal ->> 'id')
    from jsonb_array_elements(p_proposals) as proposal
  ) then
    raise exception 'Tell proposal ids must be unique.';
  end if;

  for v_proposal in
    select value from jsonb_array_elements(p_proposals)
  loop
    if jsonb_typeof(v_proposal) <> 'object' then
      raise exception 'Every Tell proposal must be an object.';
    end if;

    v_proposal_id := nullif(trim(v_proposal ->> 'id'), '');
    v_kind := nullif(trim(v_proposal ->> 'type'), '');

    if v_proposal_id is null then
      raise exception 'Every Tell proposal requires an id.';
    end if;

    if v_kind is null or v_kind not in ('note', 'shopping', 'hours') then
      raise exception 'Unsupported Tell proposal type: %', coalesce(v_kind, 'missing');
    end if;

    begin
      v_job_id := (v_proposal ->> 'job_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Every Tell proposal requires a valid job id.';
    end;

    select *
    into v_job
    from public.jobs
    where id = v_job_id
      and business_id = v_entry.business_id;

    if v_job.id is null then
      raise exception 'A Tell proposal job was not found in this business.';
    end if;

    if v_kind = 'note' then
      v_note := nullif(trim(v_proposal ->> 'note'), '');

      if v_note is null then
        raise exception 'Tell note proposals cannot be empty.';
      end if;

      insert into public.job_notes (job_id, note, note_type, owner_id)
      values (v_job_id, v_note, 'general', v_auth_user)
      returning id into v_record_id;

      v_note_id := coalesce(v_note_id, v_record_id);

      perform public.upsert_activity_event(
        v_entry.business_id, v_auth_user, v_auth_user, v_auth_user,
        v_job_id, 'note_added', 'completed', 'normal', 'job_notes',
        v_record_id, 'Note added', left(v_note, 180),
        jsonb_build_object('source', 'tell_contracktor', 'tell_entry_id', p_entry_id), now()
      );
    elsif v_kind = 'shopping' then
      v_description := nullif(trim(v_proposal ->> 'description'), '');
      v_normalized_name := nullif(trim(v_proposal ->> 'normalized_name'), '');
      v_unit := nullif(trim(v_proposal ->> 'unit'), '');
      v_quantity := nullif(trim(v_proposal ->> 'quantity'), '')::numeric;

      if v_description is null then
        raise exception 'Tell shopping proposals require a description.';
      end if;

      if v_quantity is not null and v_quantity <= 0 then
        raise exception 'Tell shopping quantities must be greater than zero.';
      end if;

      insert into public.shopping_needs (
        description, job_id, normalized_name, owner_id, performed_by_type,
        quantity, source_id, source_type, unit
      )
      values (
        v_description, v_job_id, v_normalized_name, v_auth_user, 'ai',
        v_quantity, p_entry_id, 'tell_contracktor', v_unit
      )
      returning id into v_record_id;

      perform public.upsert_activity_event(
        v_entry.business_id, v_auth_user, v_auth_user, v_auth_user,
        v_job_id, 'shopping_need_created', 'completed', 'normal', 'shopping_needs',
        v_record_id, 'Shopping need added', v_description,
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
      )
      values (
        v_note, v_duration_minutes, coalesce(v_job.hourly_rate, 0), v_job_id,
        v_auth_user, 'tell_contracktor', 'reviewed', v_work_date, v_worker_name
      )
      returning id into v_record_id;

      perform public.upsert_activity_event(
        v_entry.business_id, v_auth_user, v_auth_user, v_auth_user,
        v_job_id, 'hours_logged', 'completed', 'normal', 'time_entries',
        v_record_id, 'Hours logged', concat(v_hours, ' hrs',
          case when v_worker_name is not null then ' - ' || v_worker_name else '' end),
        jsonb_build_object(
          'durationMinutes', v_duration_minutes,
          'source', 'tell_contracktor',
          'tell_entry_id', p_entry_id,
          'workDate', v_work_date
        ), now()
      );
    end if;

    v_result_records := v_result_records || jsonb_build_array(jsonb_build_object(
      'job_id', v_job_id,
      'proposal_id', v_proposal_id,
      'record_id', v_record_id,
      'type', v_kind
    ));
  end loop;

  v_result := jsonb_build_object(
    'created_note_id', v_note_id,
    'entry_id', p_entry_id,
    'records', v_result_records,
    'replayed', false
  );

  insert into public.tell_contracktor_commits (
    entry_id, business_id, owner_id, committed_by_user_id,
    proposal_payload, result
  )
  values (
    p_entry_id, v_entry.business_id, v_entry.owner_id, v_auth_user,
    p_proposals, v_result
  );

  update public.tell_contracktor_entries
  set
    created_note_id = coalesce(v_note_id, created_note_id),
    job_id = coalesce(job_id, (v_result_records -> 0 ->> 'job_id')::uuid),
    status = 'processed',
    updated_at = now()
  where id = p_entry_id;

  return v_result;
end;
$$;

revoke all on function public.commit_tell_contracktor_entry(uuid, jsonb) from public, anon;
grant execute on function public.commit_tell_contracktor_entry(uuid, jsonb) to authenticated;
