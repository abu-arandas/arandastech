-- Gumroad sales. Gumroad pings the platform after each sale of the owner's licences; each sale is recorded once, as a
-- paid invoice, however often the ping is repeated.

create table public.gumroad_sales (
  sale_id text primary key,
  product text not null,
  invoice_id uuid references public.invoices (id),
  at timestamptz not null default now()
);
comment on table public.gumroad_sales is 'Each Gumroad sale the platform recorded, with the paid invoice it became, so a repeated ping changes nothing.';

select app.secure_all_tables();
