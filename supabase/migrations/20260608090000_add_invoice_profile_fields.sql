alter table public.profiles
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists default_invoice_terms text,
  add column if not exists default_invoice_note text;
