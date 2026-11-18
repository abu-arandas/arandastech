-- Live connectors (blueprint 9.1). A live call is made once per idempotency key: the result is kept here, so a retry
-- returns it instead of reaching the provider again. Keys and tokens are not kept here: they live in ops.secrets.

create table public.connector_calls (
  idempotency_key text primary key,
  connector text not null references public.connectors (id),
  action_type text not null,
  result jsonb not null,
  at timestamptz not null default now()
);
comment on table public.connector_calls is 'What each live connector call returned, by idempotency key, so that no action reaches a provider twice.';

-- An email or WhatsApp message is recorded once, however often the inbox is read.
create unique index messages_channel_external_id on public.messages (channel, external_id) where external_id is not null;

-- When each live inbox was last read, so the owner app can ask for new mail without reading it every second.
create table public.connector_sync (
  connector text primary key references public.connectors (id),
  synced_at timestamptz not null,
  note text not null default ''
);
comment on table public.connector_sync is 'When a live inbox (Gmail) was last read, and what was found.';

select app.secure_all_tables();
