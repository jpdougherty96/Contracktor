-- Repair historical single-job Tell Undo events created before the undo
-- function began attaching its permanent audit entry to the affected job.

with single_job_commits as (
  select
    commit.entry_id,
    (array_agg(distinct (record ->> 'job_id')::uuid))[1] as job_id
  from public.tell_contracktor_commits as commit
  cross join lateral jsonb_array_elements(commit.result -> 'records') as record
  group by commit.entry_id
  having count(distinct record ->> 'job_id') = 1
)
update public.activity_events as event
set job_id = single_job_commits.job_id
from single_job_commits
where event.event_type = 'tell_contracktor_undone'
  and event.source_table = 'tell_contracktor_entries'
  and event.source_id = single_job_commits.entry_id
  and event.job_id is null;
