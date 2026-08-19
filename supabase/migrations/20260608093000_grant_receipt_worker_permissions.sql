grant select, update
on public.receipts
to service_role;

grant select, insert, update, delete
on public.receipt_line_items
to service_role;
