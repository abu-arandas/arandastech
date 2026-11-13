-- The business: customers and leads, service packages, the catalog, orders, payments and the finance ledger.
-- Blueprint: docs/blueprint.md sections 3, 5, 6 and 12.

-- ---------------------------------------------------------------- Customers, leads and messages

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  country text,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id),
  name text not null,
  email text not null,
  phone text,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  project_type text,
  package_id text,
  message text not null,
  source text not null default 'website',
  stage text not null default 'new' check (stage in (
    'new', 'qualified', 'proposal_sent', 'won', 'lost', 'in_delivery', 'delivered', 'paid', 'retained')),
  score integer check (score between 0 and 100),
  score_reasons jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_stage on public.leads (stage, created_at desc);
create trigger leads_touch before update on public.leads for each row execute function app.touch_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id),
  customer_id uuid references public.customers (id),
  order_id uuid,
  channel text not null check (channel in ('email', 'whatsapp', 'form', 'note')),
  direction text not null check (direction in ('in', 'out', 'draft')),
  from_address text,
  to_address text,
  subject text,
  body text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  untrusted boolean not null default true,
  flagged boolean not null default false,
  flag_reasons jsonb not null default '[]',
  handled boolean not null default false,
  external_id text,
  action_id uuid references public.actions (id),
  created_at timestamptz not null default now()
);
comment on column public.messages.untrusted is 'True for anything written outside the company. Untrusted text is data, never instructions.';
create index messages_inbox on public.messages (direction, handled, created_at);

-- ---------------------------------------------------------------- Service packages (blueprint 3.1)

create table public.service_packages (
  id text primary key,
  name jsonb not null,
  outcome jsonb not null,
  audience jsonb not null,
  deliverables jsonb not null default '[]',
  exclusions jsonb not null default '[]',
  delivery jsonb not null default '{}',
  revision_limit integer,
  price_kind text not null check (price_kind in ('fixed_quote', 'monthly', 'list')),
  price_minor bigint check (price_minor >= 0),
  currency text references public.currencies (code),
  payment_schedule jsonb not null default '{}',
  support_terms jsonb not null default '{}',
  acceptance jsonb not null default '[]',
  cost jsonb not null default '{}',
  to_confirm jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  sort integer not null default 0
);
comment on table public.service_packages is 'Every service is sold as a package. to_confirm lists the fields the owner still has to set before the package record is complete.';

-- ---------------------------------------------------------------- Catalog and suppliers (blueprint 3.2)

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'candidate' check (status in ('candidate', 'approved', 'paused', 'rejected')),
  contact jsonb not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null check (kind in ('digital', 'physical')),
  name jsonb not null,
  summary jsonb not null,
  features jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'published', 'paused', 'retired')),
  supplier_id uuid references public.suppliers (id),
  delivery_days integer,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
comment on column public.products.is_test is 'A product that exists only to exercise the order loop. Never shown outside demo mode.';

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  sku text not null unique,
  name jsonb not null,
  summary jsonb not null default '{}',
  includes jsonb not null default '[]',
  price_minor bigint not null check (price_minor >= 0),
  currency text not null references public.currencies (code),
  unit_cost_minor bigint not null default 0 check (unit_cost_minor >= 0),
  support_days integer not null default 0 check (support_days >= 0),
  license_kind text,
  stock integer,
  active boolean not null default true,
  sort integer not null default 0
);

-- ---------------------------------------------------------------- Orders (blueprint 5.2)

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('Z-' || nextval('public.order_number_seq')),
  idempotency_key text not null unique,
  customer_id uuid references public.customers (id),
  buyer_name text not null,
  buyer_email text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  shipping_address text,
  status text not null default 'pending_payment' check (status in (
    'pending_payment', 'paid', 'on_hold', 'fulfilling', 'shipped', 'delivered', 'completed',
    'return_requested', 'canceled', 'refunded', 'expired')),
  hold_reason text,
  disputed boolean not null default false,
  currency text not null references public.currencies (code),
  total_minor bigint not null check (total_minor >= 0),
  checkout_session text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on column public.orders.idempotency_key is 'A repeated checkout request or payment notice finds the same order and changes nothing.';
create index orders_status on public.orders (status, created_at desc);
create trigger orders_touch before update on public.orders for each row execute function app.touch_updated_at();

alter table public.messages add constraint messages_order_fk foreign key (order_id) references public.orders (id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  variant_id uuid not null references public.product_variants (id),
  title jsonb not null,
  kind text not null check (kind in ('digital', 'physical')),
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  unit_cost_minor bigint not null default 0 check (unit_cost_minor >= 0)
);
create index order_items_order on public.order_items (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  provider text not null,
  provider_ref text not null,
  status text not null default 'pending' check (status in ('pending', 'settled', 'failed', 'refunded', 'partially_refunded')),
  amount_minor bigint not null check (amount_minor >= 0),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  currency text not null references public.currencies (code),
  captured_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (provider, provider_ref)
);
comment on table public.payments is 'A payment exists only once the provider has confirmed it to the server. pending means taken but not yet cleared.';

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  payment_id uuid not null references public.payments (id),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null references public.currencies (code),
  reason text not null,
  status text not null default 'proposed' check (status in ('proposed', 'executed', 'failed', 'rejected')),
  provider_ref text unique,
  action_id uuid references public.actions (id),
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  supplier_id uuid references public.suppliers (id),
  status text not null default 'requested' check (status in ('requested', 'placed', 'shipped', 'delivered', 'failed')),
  cost_minor bigint not null default 0,
  currency text references public.currencies (code),
  supplier_ref text,
  tracking text,
  action_id uuid references public.actions (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shipments_touch before update on public.shipments for each row execute function app.touch_updated_at();

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items (id),
  license_key text not null unique,
  kind text not null,
  holder_name text not null,
  holder_email text not null,
  issued_at timestamptz not null default now(),
  support_until timestamptz,
  revoked_at timestamptz
);
comment on table public.licenses is 'One license per order item of a digital product, in the buyer''s name, with the support period on record.';

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  payment_id uuid references public.payments (id),
  provider_ref text unique,
  reason text,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- Finance (blueprint 6.3, 6.4)

create table public.ledger_entries (
  seq bigint generated always as identity primary key,
  at timestamptz not null default now(),
  engine text not null check (engine in ('commerce', 'services', 'company')),
  account text not null check (account in (
    'gross_revenue', 'pending_revenue', 'settled_revenue',
    'product_cost', 'service_delivery_cost', 'advertising_cost', 'payment_fees',
    'refunds', 'chargebacks', 'supplier_obligations', 'tax_collected', 'operating_costs')),
  amount_minor bigint not null,
  currency text not null references public.currencies (code),
  ref_type text not null,
  ref_id text not null,
  memo text not null default ''
);
comment on table public.ledger_entries is 'Append-only postings, one per account movement, kept per engine and per currency. A correction is a new entry.';
create index ledger_entries_ref on public.ledger_entries (ref_type, ref_id);
create index ledger_entries_account on public.ledger_entries (engine, currency, account);
create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function app.forbid_change();
create trigger ledger_entries_no_truncate before truncate on public.ledger_entries
  for each statement execute function app.forbid_change();

create table public.reinvestment_proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  purchase text not null,
  cost_minor bigint not null check (cost_minor > 0),
  currency text not null references public.currencies (code),
  recurring boolean not null default false,
  twelve_month_cost_minor bigint not null,
  expected_benefit text not null,
  measure text not null,
  break_even text not null,
  rollback_plan text not null,
  available_minor bigint not null,
  reserved_minor bigint not null,
  verified_profit_minor bigint not null,
  max_budget_minor bigint not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_at date,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
