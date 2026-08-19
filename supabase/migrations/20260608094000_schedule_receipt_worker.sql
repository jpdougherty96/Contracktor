create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

do $$
begin
  perform cron.unschedule('contracktor-process-receipt-queue');
exception
  when others then
    null;
end;
$$;

select cron.schedule(
  'contracktor-process-receipt-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'contracktor_project_url'
    ) || '/functions/v1/process-receipt-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'receipt_worker_secret'
      )
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);
