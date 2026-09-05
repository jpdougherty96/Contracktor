-- Restore the job association for Tell Undo audit events without losing the
-- source-photo protections added by the grouped Tell submission workflow.

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
  v_activity_job_id uuid;
  v_undo_result jsonb;
  v_cleanup_paths jsonb;
begin
  if v_auth_user is null then
    raise exception 'Authentication is required.';
  end if;

  select business_id, result
  into v_business_id, v_commit_result
  from public.tell_contracktor_commits
  where entry_id = p_entry_id;

  if v_business_id is null then
    raise exception 'Tell commit not found.';
  end if;

  if not public.user_is_business_member(v_business_id)
    or not public.business_has_feature(v_business_id, 'tell.basic') then
    raise exception 'Tell conTRACKtor is not available for this business.';
  end if;

  if exists (
    select 1
    from public.attachments attachment
    where attachment.note_id in (
      select (records.record ->> 'record_id')::uuid
      from jsonb_array_elements(
        coalesce(v_commit_result -> 'records', '[]'::jsonb)
      ) as records(record)
      where records.record ->> 'type' = 'note'
    )
      and attachment.storage_path not like '%/' || p_entry_id::text || '-%'
      and not exists (
        select 1
        from public.tell_contracktor_attachments source
        where source.entry_id = p_entry_id
          and source.storage_path = attachment.storage_path
      )
  ) then
    raise exception 'A photo was added to a Tell-created note after approval. Edit or delete that note directly instead.';
  end if;

  -- Keep the audit event job-specific only when every committed record has a
  -- job and all of those job IDs are identical. Multi-job or unassigned Tell
  -- updates remain business-wide activity.
  select case
    when count(*) > 0
      and count(*) = count(nullif(records.record ->> 'job_id', ''))
      and count(distinct records.record ->> 'job_id') = 1
    then min(records.record ->> 'job_id')::uuid
    else null::uuid
  end
  into v_activity_job_id
  from jsonb_array_elements(
    coalesce(v_commit_result -> 'records', '[]'::jsonb)
  ) as records(record);

  v_undo_result := public.undo_tell_contracktor_entry_once(p_entry_id);

  update public.activity_events
  set job_id = v_activity_job_id
  where business_id = v_business_id
    and event_type = 'tell_contracktor_undone'
    and source_table = 'tell_contracktor_entries'
    and source_id = p_entry_id;

  select coalesce(jsonb_agg(paths.value), '[]'::jsonb)
  into v_cleanup_paths
  from jsonb_array_elements_text(
    coalesce(v_undo_result -> 'attachment_storage_paths', '[]'::jsonb)
  ) as paths(value)
  where not exists (
    select 1
    from public.tell_contracktor_attachments source
    where source.entry_id = p_entry_id
      and source.storage_path = paths.value
  );

  return jsonb_set(
    v_undo_result,
    '{attachment_storage_paths}',
    v_cleanup_paths,
    true
  );
end;
$$;

revoke all on function public.undo_tell_contracktor_entry(uuid) from public, anon;
grant execute on function public.undo_tell_contracktor_entry(uuid) to authenticated;

-- Repair Undo events created while the grouped-submission version of the
-- wrapper omitted the job association.
with commit_jobs as (
  select
    tell_commit.entry_id,
    case
      when count(*) > 0
        and count(*) = count(nullif(records.record ->> 'job_id', ''))
        and count(distinct records.record ->> 'job_id') = 1
      then min(records.record ->> 'job_id')::uuid
      else null::uuid
    end as job_id
  from public.tell_contracktor_commits tell_commit
  cross join lateral jsonb_array_elements(
    coalesce(tell_commit.result -> 'records', '[]'::jsonb)
  ) as records(record)
  group by tell_commit.entry_id
),
single_job_commits as (
  select entry_id, job_id
  from commit_jobs
  where job_id is not null
)
update public.activity_events event
set job_id = single_job_commits.job_id
from single_job_commits
where event.event_type = 'tell_contracktor_undone'
  and event.source_table = 'tell_contracktor_entries'
  and event.source_id = single_job_commits.entry_id
  and event.job_id is null;
