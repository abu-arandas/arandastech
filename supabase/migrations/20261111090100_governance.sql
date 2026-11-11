-- Governance: connectors, actions, approvals and standing rules.
-- Blueprint: docs/blueprint.md sections 2.2 to 2.6, 9.1 and 11.2.

-- ---------------------------------------------------------------- Connectors (blueprint 9.1, 13.4)

create table public.connectors (
  id text primary key,
  name text not null,
  mode text not null default 'mock' check (mode in ('mock', 'live')),
  status text not null default 'built' check (status in (
    'planned', 'in_development', 'built', 'awaiting_authorization', 'connected',
    'approval_required', 'provider_limited', 'live', 'paused', 'failed')),
  status_note text not null default '',
  last_ok_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
comment on table public.connectors is 'One row per outside service. status is the honest capability status shown on the dashboard.';
create trigger connectors_touch before update on public.connectors for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------- Standing rules (blueprint 2.5)

create table public.standing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  action_type text not null,
  connector text not null references public.connectors (id),
  conditions jsonb not null default '{}',
  spend_limit_per_action_minor bigint not null default 0 check (spend_limit_per_action_minor >= 0),
  spend_limit_per_period_minor bigint not null default 0 check (spend_limit_per_period_minor >= 0),
  currency text references public.currencies (code),
  recipient_limit_per_period integer not null check (recipient_limit_per_period > 0),
  period text not null default 'day' check (period in ('day', 'week', 'month')),
  expires_at timestamptz not null,
  max_failures integer not null default 3 check (max_failures > 0),
  status text not null default 'active' check (status in ('active', 'suspended', 'expired', 'revoked')),
  suspended_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
comment on table public.standing_rules is 'The owner''s written permission for one narrow class of action to run without asking each time. Scope, spending limit, recipient limit, expiry and stop conditions are all required.';

-- ---------------------------------------------------------------- Actions (blueprint 2.2, 2.4)

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  connector text not null references public.connectors (id),
  level smallint not null check (level between 0 and 3),
  status text not null default 'proposed' check (status in (
    'proposed', 'blocked', 'auto_approved', 'pending', 'approved', 'rejected', 'expired', 'executing', 'executed', 'failed')),
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  summary text not null,
  recipient text,
  cost_minor bigint not null default 0 check (cost_minor >= 0),
  currency text references public.currencies (code),
  reversible boolean not null default false,
  risk text not null default '',
  expected_result text not null default '',
  evidence jsonb not null default '[]',
  reasons jsonb not null default '[]',
  requested_by_kind text not null check (requested_by_kind in ('person', 'agent', 'automation', 'system')),
  requested_by_id text,
  agent_run_id uuid references public.agent_runs (id),
  task_id uuid references public.tasks (id),
  standing_rule_id uuid references public.standing_rules (id),
  idempotency_key text not null unique,
  untrusted_input boolean not null default false,
  held_reason text,
  result jsonb,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz
);
comment on table public.actions is 'Every operation that would leave the platform. The level is set from the action itself, never by the requester.';
comment on column public.actions.payload_hash is 'SHA-256 of the canonical payload. An approval is tied to this hash: what is approved is what runs.';
comment on column public.actions.held_reason is 'Set while a pause keeps an allowed action from running. Held actions are kept, not dropped.';
create index actions_status on public.actions (status, created_at);
create index actions_type on public.actions (action_type, created_at desc);

-- A payload can change only while its action still waits for a decision (the owner's edit). After that it is frozen.
create function app.freeze_action_payload() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.payload is distinct from old.payload or new.payload_hash is distinct from old.payload_hash)
     and old.status not in ('proposed', 'pending') then
    raise exception 'the payload of action % is frozen in status %', old.id, old.status using errcode = 'restrict_violation';
  end if;
  if old.status in ('executed', 'rejected', 'expired', 'blocked') and new.status is distinct from old.status then
    raise exception 'action % is finished (%) and cannot change status', old.id, old.status using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
create trigger actions_freeze before update on public.actions for each row execute function app.freeze_action_payload();

-- ---------------------------------------------------------------- Approvals (blueprint 2.4)

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique references public.actions (id),
  level smallint not null check (level between 2 and 3),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  expires_at timestamptz not null,
  postponed_until timestamptz,
  batch_key text,
  created_at timestamptz not null default now()
);
comment on table public.approval_requests is 'Asks the owner to allow one exact action. A request that reaches expires_at lapses: silence is a no.';
create index approval_requests_open on public.approval_requests (status, expires_at);

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests (id),
  decision text not null check (decision in ('approve', 'reject', 'postpone', 'expire')),
  decided_by uuid,
  original_payload jsonb,
  edited_payload jsonb,
  final_payload_hash text,
  confirmation jsonb,
  note text,
  decided_at timestamptz not null default now()
);
comment on table public.approval_decisions is 'Who decided, when, and on what payload. When the owner edits a request both versions are kept.';
create trigger approval_decisions_append_only before update or delete on public.approval_decisions
  for each row execute function app.forbid_change();

create table public.standing_rule_uses (
  id bigint generated always as identity primary key,
  rule_id uuid not null references public.standing_rules (id),
  action_id uuid not null references public.actions (id),
  spend_minor bigint not null default 0,
  recipient text,
  at timestamptz not null default now()
);
create index standing_rule_uses_rule on public.standing_rule_uses (rule_id, at desc);

-- ---------------------------------------------------------------- Incoming events and mock deliveries

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  connector text not null references public.connectors (id),
  external_id text not null,
  event_type text not null,
  signature_ok boolean not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  unique (connector, external_id)
);
comment on table public.webhook_events is 'Every incoming provider event, once. A repeated delivery hits the unique key and changes nothing.';

create table public.mock_deliveries (
  id uuid primary key default gen_random_uuid(),
  connector text not null references public.connectors (id),
  action_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null,
  result jsonb not null default '{}',
  at timestamptz not null default now()
);
comment on table public.mock_deliveries is 'What the mock connectors would have sent. Lets the whole loop be tested with no live account.';
