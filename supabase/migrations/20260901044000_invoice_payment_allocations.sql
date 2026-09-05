-- Apply job payments to invoices without allowing the same payment dollars to
-- reduce more than one invoice. Payments and invoices are matched oldest-first.

create table public.invoice_payment_allocations (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_id uuid not null references public.customer_payments(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  amount numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (invoice_id, payment_id),
  constraint invoice_payment_allocations_amount_check check (amount > 0)
);

create index invoice_payment_allocations_payment_idx
on public.invoice_payment_allocations (payment_id);

create index invoice_payment_allocations_job_idx
on public.invoice_payment_allocations (job_id, invoice_id);

alter table public.invoice_payment_allocations enable row level security;

create policy "Business managers can read invoice payment allocations"
on public.invoice_payment_allocations
for select
to authenticated
using (public.user_can_manage_business(business_id));

grant select on public.invoice_payment_allocations to authenticated;
revoke insert, update, delete on public.invoice_payment_allocations from authenticated;

create or replace function public.rebuild_job_invoice_payment_allocations(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_id is null then
    return;
  end if;

  delete from public.invoice_payment_allocations
  where job_id = p_job_id;

  with ordered_payments as (
    select
      p.id,
      p.business_id,
      p.owner_id,
      p.job_id,
      coalesce(
        sum(p.amount) over (
          order by p.payment_date, p.created_at nulls first, p.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as payment_start,
      sum(p.amount) over (
        order by p.payment_date, p.created_at nulls first, p.id
        rows between unbounded preceding and current row
      ) as payment_end
    from public.customer_payments p
    where p.job_id = p_job_id
  ),
  ordered_invoices as (
    select
      i.id,
      i.business_id,
      i.owner_id,
      i.job_id,
      coalesce(
        sum(greatest(i.subtotal - i.retainage_amount, 0)) over (
          order by i.created_at, i.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as invoice_start,
      sum(greatest(i.subtotal - i.retainage_amount, 0)) over (
        order by i.created_at, i.id
        rows between unbounded preceding and current row
      ) as invoice_end
    from public.invoices i
    where i.job_id = p_job_id
      and i.status <> 'void'
      and greatest(i.subtotal - i.retainage_amount, 0) > 0
  )
  insert into public.invoice_payment_allocations (
    invoice_id,
    payment_id,
    business_id,
    owner_id,
    job_id,
    amount
  )
  select
    i.id,
    p.id,
    i.business_id,
    i.owner_id,
    i.job_id,
    round(
      least(p.payment_end, i.invoice_end)
        - greatest(p.payment_start, i.invoice_start),
      2
    )
  from ordered_invoices i
  join ordered_payments p
    on p.business_id = i.business_id
    and p.job_id = i.job_id
    and least(p.payment_end, i.invoice_end)
      > greatest(p.payment_start, i.invoice_start);

  update public.invoices i
  set
    amount_paid = coalesce(
      (
        select round(sum(a.amount), 2)
        from public.invoice_payment_allocations a
        where a.invoice_id = i.id
      ),
      0
    ),
    balance_due = case
      when i.status = 'void' then 0
      else round(
        greatest(i.subtotal - i.retainage_amount, 0)
          - coalesce(
              (
                select sum(a.amount)
                from public.invoice_payment_allocations a
                where a.invoice_id = i.id
              ),
              0
            ),
        2
      )
    end,
    updated_at = case
      when i.amount_paid is distinct from coalesce(
        (
          select round(sum(a.amount), 2)
          from public.invoice_payment_allocations a
          where a.invoice_id = i.id
        ),
        0
      ) then clock_timestamp()
      when i.balance_due is distinct from case
        when i.status = 'void' then 0
        else round(
          greatest(i.subtotal - i.retainage_amount, 0)
            - coalesce(
                (
                  select sum(a.amount)
                  from public.invoice_payment_allocations a
                  where a.invoice_id = i.id
                ),
                0
              ),
          2
        )
      end then clock_timestamp()
      else i.updated_at
    end
  where i.job_id = p_job_id;
end;
$$;

revoke all on function public.rebuild_job_invoice_payment_allocations(uuid)
from public, authenticated;

create or replace function public.set_invoice_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge numeric;
  v_payments numeric;
  v_prior_charges numeric;
begin
  if new.status = 'void' then
    new.amount_paid := 0;
    new.balance_due := 0;
    return new;
  end if;

  v_charge := greatest(new.subtotal - new.retainage_amount, 0);

  select coalesce(sum(p.amount), 0)
  into v_payments
  from public.customer_payments p
  where p.job_id = new.job_id
    and p.business_id = new.business_id;

  select coalesce(sum(greatest(i.subtotal - i.retainage_amount, 0)), 0)
  into v_prior_charges
  from public.invoices i
  where i.job_id = new.job_id
    and i.business_id = new.business_id
    and i.status <> 'void'
    and i.id <> new.id
    and (i.created_at, i.id) < (new.created_at, new.id);

  new.amount_paid := round(
    least(v_charge, greatest(v_payments - v_prior_charges, 0)),
    2
  );
  new.balance_due := round(v_charge - new.amount_paid, 2);

  return new;
end;
$$;

revoke all on function public.set_invoice_payment_totals()
from public, authenticated;

create trigger set_invoice_payment_totals_before_write
before insert or update of subtotal, retainage_amount, status
on public.invoices
for each row execute function public.set_invoice_payment_totals();

create or replace function public.sync_job_invoice_payments_after_invoice_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebuild_job_invoice_payment_allocations(new.job_id);
  return new;
end;
$$;

revoke all on function public.sync_job_invoice_payments_after_invoice_write()
from public, authenticated;

create trigger sync_job_invoice_payments_after_invoice_write
after insert or update of subtotal, retainage_amount, status
on public.invoices
for each row execute function public.sync_job_invoice_payments_after_invoice_write();

create or replace function public.sync_job_invoice_payments_after_payment_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rebuild_job_invoice_payment_allocations(old.job_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.job_id is distinct from new.job_id then
    perform public.rebuild_job_invoice_payment_allocations(old.job_id);
  end if;

  perform public.rebuild_job_invoice_payment_allocations(new.job_id);
  return new;
end;
$$;

revoke all on function public.sync_job_invoice_payments_after_payment_write()
from public, authenticated;

create trigger sync_job_invoice_payments_after_payment_write
after insert or delete or update of amount, payment_date, job_id
on public.customer_payments
for each row execute function public.sync_job_invoice_payments_after_payment_write();

create or replace function public.get_job_invoice_payment_credit(p_job_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_invoice public.invoices;
  v_payments numeric;
  v_prior_charges numeric;
  v_total_charges numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select j.business_id
  into v_business_id
  from public.jobs j
  where j.id = p_job_id;

  if v_business_id is null then
    raise exception 'Job not found.';
  end if;

  if not public.user_can_manage_business(v_business_id) then
    raise exception 'Only a business owner or admin can view invoice payments.';
  end if;

  select coalesce(sum(p.amount), 0)
  into v_payments
  from public.customer_payments p
  where p.job_id = p_job_id
    and p.business_id = v_business_id;

  select *
  into v_invoice
  from public.invoices i
  where i.job_id = p_job_id
    and i.status = 'draft'
  order by i.updated_at desc, i.created_at desc, i.id desc
  limit 1;

  if v_invoice.id is not null then
    select coalesce(sum(greatest(i.subtotal - i.retainage_amount, 0)), 0)
    into v_prior_charges
    from public.invoices i
    where i.job_id = p_job_id
      and i.business_id = v_business_id
      and i.status <> 'void'
      and i.id <> v_invoice.id
      and (i.created_at, i.id) < (v_invoice.created_at, v_invoice.id);

    return round(greatest(v_payments - v_prior_charges, 0), 2);
  end if;

  select coalesce(sum(greatest(i.subtotal - i.retainage_amount, 0)), 0)
  into v_total_charges
  from public.invoices i
  where i.job_id = p_job_id
    and i.business_id = v_business_id
    and i.status <> 'void';

  return round(greatest(v_payments - v_total_charges, 0), 2);
end;
$$;

revoke all on function public.get_job_invoice_payment_credit(uuid) from public;
grant execute on function public.get_job_invoice_payment_credit(uuid) to authenticated;

do $$
declare
  v_job record;
begin
  for v_job in
    select distinct job_id
    from public.invoices
    where job_id is not null
  loop
    perform public.rebuild_job_invoice_payment_allocations(v_job.job_id);
  end loop;
end;
$$;
