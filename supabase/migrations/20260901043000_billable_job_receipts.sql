-- A receipt assigned to a job is the receipt-review flow's explicit signal that
-- the cost belongs to that job. The review UI has no separate billable choice,
-- so make that assignment invoice-eligible while keeping Tools / Inventory out.

create or replace function public.mark_committed_job_receipt_billable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.receipt_financial_commit', true) = 'on'
    and new.job_id is not null
    and new.source_type in ('receipt', 'receipt_line_item')
  then
    new.billable := true;
  end if;

  return new;
end;
$$;

create trigger mark_committed_job_receipt_billable
before insert or update of job_id, source_type on public.expenses
for each row execute function public.mark_committed_job_receipt_billable();

select set_config('app.receipt_financial_commit', 'on', true);

update public.expenses
set
  billable = true,
  updated_at = clock_timestamp()
where job_id is not null
  and source_type in ('receipt', 'receipt_line_item')
  and status in ('reviewed', 'billable')
  and invoice_id is null
  and not billable;

revoke all on function public.mark_committed_job_receipt_billable() from public, authenticated;
