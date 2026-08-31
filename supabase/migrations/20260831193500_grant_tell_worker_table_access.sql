-- The Tell Edge worker uses the service-role key through PostgREST. Bypassing
-- RLS does not bypass PostgreSQL table privileges, so grant the worker only
-- the direct table operations used by the processing and failure paths.

grant select, update
on table public.tell_contracktor_entries
to service_role;

grant select
on table public.jobs
to service_role;

grant select, insert, update
on table public.activity_events
to service_role;
