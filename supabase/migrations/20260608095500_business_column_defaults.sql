alter table public.contacts
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.jobs
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.job_crew_members
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.job_contacts
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.job_plans
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.receipts
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.receipt_line_items
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.expenses
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.time_entries
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.customer_payments
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.job_notes
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.attachments
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();

alter table public.job_activity
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid(),
alter column actor_user_id set default auth.uid();

alter table public.job_snapshots
alter column business_id set default public.default_business_for_user(auth.uid()),
alter column created_by_user_id set default auth.uid();
