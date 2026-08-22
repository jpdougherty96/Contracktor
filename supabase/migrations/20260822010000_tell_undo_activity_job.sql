-- Keep the permanent undo audit trail attached to its job when every record
-- in the Tell update belongs to the same job. Multi-job updates remain
-- business-wide activity.

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
    from public.attachments a
    where a.note_id in (
      select (record ->> 'record_id')::uuid
      from jsonb_array_elements(v_commit_result -> 'records') as record
      where record ->> 'type' = 'note'
    )
      and a.storage_path not like '%/' || p_entry_id::text || '-%'
  ) then
    raise exception 'A photo was added to a Tell-created note after approval. Edit or delete that note directly instead.';
  end if;

  if (
    select count(distinct record ->> 'job_id')
    from jsonb_array_elements(v_commit_result -> 'records') as record
  ) = 1 then
    select (record ->> 'job_id')::uuid
    into v_activity_job_id
    from jsonb_array_elements(v_commit_result -> 'records') as record
    limit 1;
  end if;

  v_undo_result := public.undo_tell_contracktor_entry_once(p_entry_id);

  update public.activity_events
  set job_id = v_activity_job_id
  where business_id = v_business_id
    and event_type = 'tell_contracktor_undone'
    and source_table = 'tell_contracktor_entries'
    and source_id = p_entry_id;

  return v_undo_result;
end;
$$;

revoke all on function public.undo_tell_contracktor_entry(uuid) from public, anon;
grant execute on function public.undo_tell_contracktor_entry(uuid) to authenticated;
