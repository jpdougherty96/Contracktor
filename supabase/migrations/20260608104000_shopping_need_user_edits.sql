alter table public.shopping_needs
add column if not exists user_display_text text,
add column if not exists user_edited_at timestamptz,
add column if not exists user_edited_by_user_id uuid references public.profiles(id) on delete set null;
