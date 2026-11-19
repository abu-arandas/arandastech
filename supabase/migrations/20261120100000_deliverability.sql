-- Deliverability: an address that bounced is never written to again, and every sales email carries a link that stops
-- the emails in one click. The bounce rate also sets how many first emails Sales may send each day.

alter table public.leads
  add column bounced_at timestamptz,
  add column opt_out_token uuid not null default gen_random_uuid();
comment on column public.leads.bounced_at is 'When a delivery failure notice named this address. Nothing is sent to it again.';
comment on column public.leads.opt_out_token is 'The secret in the lead''s one-click unsubscribe link.';
create unique index leads_opt_out_token on public.leads (opt_out_token);
create index leads_bounced on public.leads (bounced_at) where bounced_at is not null;
