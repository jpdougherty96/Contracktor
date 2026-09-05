-- Existing OCR line numbers are advisory; persist one deterministic sequence per receipt.

with ranked as (
  select
    id,
    row_number() over (
      partition by receipt_id
      order by line_number, created_at, id
    ) as next_line_number
  from public.receipt_line_items
)
update public.receipt_line_items line_item
set line_number = ranked.next_line_number
from ranked
where line_item.id = ranked.id
  and line_item.line_number is distinct from ranked.next_line_number;

create unique index if not exists receipt_line_items_receipt_line_number_unique
on public.receipt_line_items (receipt_id, line_number);
