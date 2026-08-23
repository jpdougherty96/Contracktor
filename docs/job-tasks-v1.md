# Job Tasks v1

## Product rule

> Job Tasks describe what needs to happen. Job History preserves what actually happened.

Tasks are lightweight planned work attached to a job. They are not a project-management system.

## Current scope

- Owners and admins can view, create, rename, complete, reopen, and cancel tasks.
- Tasks have `open`, `completed`, and `cancelled` states.
- Completion and cancellation are attributable to an authenticated user and timestamp.
- Every creation, rename, completion, reopening, and cancellation creates an immutable task event and a durable Activity/Job History entry.
- Task creation and changes use idempotent, server-authoritative RPCs. The client cannot write task tables directly.
- The Job Snapshot shows the authoritative open-task count.
- The job screen shows open, completed, and cancelled work without deleting prior history.

## Permission boundary

Task reads and mutations are currently limited to business owners/admins.

The existing `job_crew_members` records are names and hourly rates, not authenticated user assignments. Business membership alone is not enough to prove that a crew user belongs to a specific job. Crew task access therefore remains disabled until conTRACKtor has an authoritative authenticated user-to-job assignment table and matching job-scoped RLS.

## Deliberately deferred

- assignees and crew task access
- Tell conTRACKtor `task_create` and `task_complete` proposals
- priorities, due dates, boards, subtasks, dependencies, reminders, comments, and attachments
- autonomous task creation or completion

The next safe sequence is:

1. Add authenticated job assignments and job-scoped crew access.
2. Add supervised Tell proposal parsing and authoritative task-ID matching.
3. Extend the atomic Tell commit/Undo boundary with stale-state and idempotency tests.

## Deployment order

Apply `20260823010000_job_tasks.sql` before deploying the web bundle. The current production database does not have the task tables or RPCs until that migration is pushed.
