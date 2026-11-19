-- The revenue engine: prospects and follow-up sequences on the leads, proposals the client accepts online, invoices
-- and their payments, and the client check-ins after delivery. The monthly goal lives in the policy sheet.

-- ---------------------------------------------------------------- Leads become a pipeline

alter table public.leads drop constraint leads_stage_check;
alter table public.leads add constraint leads_stage_check check (stage in (
  'new', 'contacted', 'replied', 'meeting', 'qualified', 'proposal_sent', 'won', 'lost',
  'in_delivery', 'delivered', 'paid', 'retained'));

alter table public.leads
  add column kind text not null default 'inbound' check (kind in ('inbound', 'prospect')),
  add column company text,
  add column website text,
  add column country text,
  add column value_minor bigint check (value_minor >= 0),
  add column value_currency text references public.currencies (code),
  add column sequence text,
  add column sequence_step integer not null default 0 check (sequence_step >= 0),
  add column next_step_at timestamptz,
  add column last_action_id uuid references public.actions (id),
  add column last_contact_at timestamptz,
  add column replied_at timestamptz,
  add column do_not_contact boolean not null default false,
  add column notes text not null default '';
comment on column public.leads.kind is 'inbound: wrote to us through the website. prospect: a business the owner chose to contact first.';
comment on column public.leads.sequence is 'The follow-up sequence the lead is in (outreach, proposal, check_in), or null when nothing is due.';
comment on column public.leads.next_step_at is 'When Sales sends the next email of the sequence. Null stops it.';
comment on column public.leads.last_action_id is 'The last email Sales proposed in the sequence. The next one waits until the owner has decided on it.';
comment on column public.leads.do_not_contact is 'The lead asked not to be written to again. Nothing is ever sent to them.';
create index leads_next_step on public.leads (next_step_at) where next_step_at is not null and not do_not_contact;
create unique index leads_prospect_email on public.leads (lower(email)) where kind = 'prospect';

-- ---------------------------------------------------------------- Proposals and invoices

create sequence public.proposal_number_seq;
create sequence public.invoice_number_seq;

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  lead_id uuid not null references public.leads (id),
  package_id text references public.service_packages (id),
  title text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total_minor bigint not null check (total_minor > 0),
  currency text not null references public.currencies (code),
  deposit_bps integer not null check (deposit_bps between 0 and 10000),
  notes text not null default '',
  locale text not null default 'en' check (locale in ('en', 'ar')),
  valid_until date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  public_token text not null unique,
  accepted_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  decided_at timestamptz
);
comment on table public.proposals is 'A written quote. The client opens it by its secret link and accepts it there; accepting it raises the first invoice.';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  lead_id uuid references public.leads (id),
  proposal_id uuid references public.proposals (id),
  title text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total_minor bigint not null check (total_minor > 0),
  currency text not null references public.currencies (code),
  buyer_name text not null,
  buyer_email text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  due_on date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  public_token text not null unique,
  paid_at timestamptz,
  paid_via text,
  reminders_sent integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
comment on table public.invoices is 'What a client owes. Marking it paid posts the money to the services books, and counts toward the monthly goal.';
create index invoices_open on public.invoices (status, due_on);
create index invoices_paid on public.invoices (paid_at) where status = 'paid';

select app.secure_all_tables();
grant usage, select on all sequences in schema public to service_role;
