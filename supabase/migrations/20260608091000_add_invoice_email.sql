alter table public.profiles
  add column if not exists invoice_email text;
