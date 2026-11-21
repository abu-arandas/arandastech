-- Plans: what a client pays again and again (monthly or yearly), or once after a free trial. Sales raises each
-- invoice on its day, reminds twice, and puts the plan on hold with a polite note when an invoice is 14 days late.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  title text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null references public.currencies (code),
  every text not null check (every in ('once', 'month', 'year')),
  status text not null default 'active' check (status in ('trial', 'active', 'on_hold', 'ended', 'cancelled')),
  -- The day of the month the invoices fall on, kept when a short month moves one invoice earlier.
  anchor_day integer not null check (anchor_day between 1 and 31),
  next_invoice_on date,
  invoices_made integer not null default 0,
  buyer_name text not null,
  buyer_email text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  created_at timestamptz not null default now(),
  on_hold_at timestamptz,
  ended_at timestamptz
);
comment on table public.plans is 'What a client pays on a schedule, or once after a free trial. Sales raises each invoice on next_invoice_on.';
comment on column public.plans.every is 'once: one invoice when the trial ends. month or year: an invoice every month or year.';
comment on column public.plans.status is 'trial: free until next_invoice_on. on_hold: an invoice is 14 days late, no new invoices until it is paid.';
create index plans_due on public.plans (next_invoice_on) where status in ('trial', 'active');
create unique index plans_one_open_per_lead on public.plans (lead_id) where status in ('trial', 'active', 'on_hold');

alter table public.invoices
  add column plan_id uuid references public.plans (id),
  add column hold_notice_at timestamptz;
comment on column public.invoices.plan_id is 'The plan this invoice bills, if any.';
comment on column public.invoices.hold_notice_at is 'When Sales wrote that the plan is on hold because this invoice is late.';
create index invoices_plan on public.invoices (plan_id) where plan_id is not null;

select app.secure_all_tables();
