create index if not exists receipts_duplicate_lookup_idx
on public.receipts (owner_id, receipt_date, total)
where total is not null;
