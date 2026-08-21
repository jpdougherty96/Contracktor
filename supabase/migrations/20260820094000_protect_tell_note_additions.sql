-- Adding a new photo is a human correction. Protect it from the existing Tell
-- Undo implementation just like edits to notes, hours, and shopping needs.

alter function public.undo_tell_contracktor_entry(uuid)
rename to undo_tell_contracktor_entry_once;

revoke all on function public.undo_tell_contracktor_entry_once(uuid)
from public, anon, authenticated;

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

  return public.undo_tell_contracktor_entry_once(p_entry_id);
end;
$$;

revoke all on function public.undo_tell_contracktor_entry(uuid) from public, anon;
grant execute on function public.undo_tell_contracktor_entry(uuid) to authenticated;
