-- Remove queue messages whose durable Tell source has already been deleted.
-- Leaving these messages in pgmq causes the fixed-size worker batch to reclaim
-- the same missing sources forever and starve newer valid submissions.

do $$
declare
  v_message record;
  v_entry_id uuid;
begin
  for v_message in
    select msg_id, message
    from pgmq.q_tell_processing
  loop
    begin
      v_entry_id := (v_message.message ->> 'entry_id')::uuid;
    exception
      when invalid_text_representation then
        perform pgmq.delete('tell_processing', v_message.msg_id);
        continue;
    end;

    if v_entry_id is null or not exists (
      select 1
      from public.tell_contracktor_entries entry
      where entry.id = v_entry_id
    ) then
      perform pgmq.delete('tell_processing', v_message.msg_id);
    end if;
  end loop;
end;
$$;
