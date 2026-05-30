create or replace view public.tools_inventory_expenses
with (security_invoker = true)
as
select
  e.id,
  e.owner_id,
  e.receipt_id,
  e.receipt_line_item_id,
  e.description,
  e.expense_date,
  e.expense_type,
  e.source_type,
  e.pre_tax_amount,
  e.tax_amount,
  e.total_amount,
  e.billable,
  e.status,
  e.notes,
  e.created_at,
  e.updated_at,
  r.vendor as receipt_vendor,
  r.receipt_date,
  r.storage_path as receipt_storage_path
from public.expenses e
left join public.receipts r on r.id = e.receipt_id and r.owner_id = e.owner_id
where e.job_id is null
  and e.expense_type in ('tool', 'inventory')
  and e.status <> 'ignored';

grant select
on public.tools_inventory_expenses
to authenticated;

create index if not exists expenses_owner_tools_inventory_idx
on public.expenses (owner_id, expense_date desc)
where job_id is null
  and expense_type in ('tool', 'inventory')
  and status <> 'ignored';
