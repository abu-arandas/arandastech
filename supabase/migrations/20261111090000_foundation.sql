-- Foundation: helpers, staff, the policy sheet, pause flags, the audit log, agents, tasks, jobs, alerts, memory.
-- Blueprint: docs/blueprint.md sections 2, 7, 8.5 and 12.
--
-- Conventions used by every migration:
--   * Money is a whole number of the currency's smallest unit (bigint) next to a currency code.
--   * An "actor" is a person, an agent run, an automation or the system: (actor_kind, actor_id).
--   * Lists of allowed values are CHECK constraints on text, which are easier to extend than enum types.
--   * Every table gets row-level security in 20261111090300_security.sql.

create schema if not exists app;
comment on schema app is 'Helper functions. Not exposed through the API.';

-- ---------------------------------------------------------------- Currencies

create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  exponent smallint not null check (exponent between 0 and 4),
  name text not null
);
comment on table public.currencies is 'ISO 4217 currencies in use. exponent is the number of decimal places: 3 for the dinar, 2 for the dollar.';

insert into public.currencies (code, exponent, name) values
  ('JOD', 3, 'Jordanian dinar'),
  ('USD', 2, 'US dollar'),
  ('EUR', 2, 'Euro');

-- ---------------------------------------------------------------- Staff

create table public.staff_members (
  user_id uuid primary key,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('owner', 'member')),
  locale text not null default 'en' check (locale in ('en', 'ar')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.staff_members is 'People who may sign in to the owner app. user_id is auth.users.id on Supabase.';

-- Used by the row-level security policies. SECURITY DEFINER so that the check itself is not subject to RLS.
create function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members s where s.user_id = (select auth.uid()) and s.active);
$$;

create function app.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members s where s.user_id = (select auth.uid()) and s.active and s.role = 'owner');
$$;

-- Shared trigger: rows of an append-only table can never be changed or removed.
create function app.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op using errcode = 'restrict_violation';
end;
$$;

create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- Policy sheet (blueprint 2.7)

create table public.policy_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);
comment on table public.policy_settings is 'The numbers the platform enforces. Only the owner changes them, and every change is kept in policy_setting_history.';

create table public.policy_setting_history (
  id bigint generated always as identity primary key,
  key text not null,
  value jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by text not null
);

create function app.record_policy_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.policy_setting_history (key, value, changed_by) values (new.key, new.value, new.updated_by);
  return new;
end;
$$;

create trigger policy_settings_history after insert or update on public.policy_settings
  for each row execute function app.record_policy_change();
create trigger policy_setting_history_append_only before update or delete on public.policy_setting_history
  for each row execute function app.forbid_change();

-- ---------------------------------------------------------------- Pause flags (blueprint 2.6)

create table public.pause_flags (
  scope text not null check (scope in ('global', 'connector', 'department', 'product', 'supplier', 'orders', 'advertising', 'fulfillment', 'rule')),
  target text not null default '*',
  paused boolean not null,
  reason text not null default '',
  set_by_kind text not null check (set_by_kind in ('person', 'agent', 'automation', 'system')),
  set_by_id text,
  set_at timestamptz not null default now(),
  primary key (scope, target)
);
comment on table public.pause_flags is 'Read by the connector gateway on every action. Anyone may pause; only the owner resumes.';

-- ---------------------------------------------------------------- Audit log (blueprint 11.4 rule 5)

create table public.audit_events (
  seq bigint primary key,
  at timestamptz not null,
  actor_kind text not null check (actor_kind in ('person', 'agent', 'automation', 'system')),
  actor_id text,
  event_type text not null,
  subject_type text,
  subject_id text,
  data jsonb not null default '{}',
  prev_hash text not null,
  hash text not null
);
comment on table public.audit_events is 'Append-only record of every action and decision. Each entry carries the hash of the entry before it.';

create index audit_events_subject on public.audit_events (subject_type, subject_id);
create index audit_events_type on public.audit_events (event_type, seq desc);

-- The text that is hashed for one entry. Kept in one place so that the insert trigger and the verifier agree.
create function app.audit_digest(
  p_prev text, p_seq bigint, p_at timestamptz, p_actor_kind text, p_actor_id text,
  p_type text, p_subject_type text, p_subject_id text, p_data jsonb
) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(
    p_prev || '|' || p_seq::text || '|' ||
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
    p_actor_kind || '|' || coalesce(p_actor_id, '') || '|' || p_type || '|' ||
    coalesce(p_subject_type, '') || '|' || coalesce(p_subject_id, '') || '|' || p_data::text,
    'UTF8')), 'hex');
$$;

-- Numbers and chains each entry under one lock, so that the chain follows seq exactly.
create function app.audit_chain() returns trigger
language plpgsql set search_path = '' as $$
declare
  last_seq bigint;
  last_hash text;
begin
  perform pg_advisory_xact_lock(4711001);
  select e.seq, e.hash into last_seq, last_hash from public.audit_events e order by e.seq desc limit 1;
  new.seq := coalesce(last_seq, 0) + 1;
  new.at := clock_timestamp();
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.hash := app.audit_digest(new.prev_hash, new.seq, new.at, new.actor_kind, new.actor_id,
                               new.event_type, new.subject_type, new.subject_id, new.data);
  return new;
end;
$$;

create trigger audit_events_chain before insert on public.audit_events
  for each row execute function app.audit_chain();
create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function app.forbid_change();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function app.forbid_change();

-- Returns the seq of the first entry whose hash or link is wrong, or null when the whole chain is intact.
create function app.verify_audit_chain() returns bigint
language plpgsql stable set search_path = '' as $$
declare
  e record;
  expected_prev text := repeat('0', 64);
begin
  for e in select * from public.audit_events order by seq loop
    if e.prev_hash <> expected_prev
       or e.hash <> app.audit_digest(e.prev_hash, e.seq, e.at, e.actor_kind, e.actor_id,
                                     e.event_type, e.subject_type, e.subject_id, e.data) then
      return e.seq;
    end if;
    expected_prev := e.hash;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------- Agents and their runs (blueprint 7)

create table public.agents (
  id text primary key,
  name text not null,
  mission text not null,
  max_auto_level smallint not null default 1 check (max_auto_level between 0 and 1),
  can_pause boolean not null default false,
  enabled boolean not null default true
);
comment on table public.agents is 'The AI departments. max_auto_level is the highest action level a department runs without approval.';

create table public.commands (
  id uuid primary key default gen_random_uuid(),
  instruction text not null,
  objective text,
  plan jsonb,
  warnings jsonb not null default '[]',
  report jsonb,
  status text not null default 'planning' check (status in ('planning', 'running', 'done', 'failed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
comment on table public.commands is 'Instructions the owner typed in the command center, with the plan and the report.';

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  command_id uuid references public.commands (id),
  parent_id uuid references public.tasks (id),
  department text not null references public.agents (id),
  kind text not null,
  title text not null,
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'done', 'failed', 'skipped', 'blocked')),
  result jsonb,
  error text,
  due_at timestamptz,
  created_by_kind text not null default 'system' check (created_by_kind in ('person', 'agent', 'automation', 'system')),
  created_by_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_status on public.tasks (status, created_at);
create trigger tasks_touch before update on public.tasks for each row execute function app.touch_updated_at();

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on uuid not null references public.tasks (id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents (id),
  workflow text not null,
  trigger_kind text not null check (trigger_kind in ('command', 'event', 'schedule', 'manual')),
  trigger_ref text,
  task_id uuid references public.tasks (id),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  untrusted_input boolean not null default false,
  input jsonb not null default '{}',
  output jsonb,
  error text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_micros bigint not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
comment on column public.agent_runs.untrusted_input is 'True when the run read content from outside the company. Such a run can read and draft only; anything more goes to the owner.';
comment on column public.agent_runs.cost_micros is 'Model cost of the run in millionths of a US dollar.';
create index agent_runs_started on public.agent_runs (started_at desc);

-- ---------------------------------------------------------------- Background jobs

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  locked_at timestamptz,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_due on public.jobs (status, run_at);

-- ---------------------------------------------------------------- Security alerts

create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  kind text not null,
  summary text not null,
  detail jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_by_kind text not null default 'system' check (created_by_kind in ('person', 'agent', 'automation', 'system')),
  created_by_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- Business memory (blueprint 8.5)

create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  kind text not null check (kind in ('brand', 'product', 'package', 'pricing', 'faq', 'sop', 'template', 'style', 'technical', 'supplier', 'policy', 'decision')),
  title text not null,
  body jsonb not null,
  source text not null,
  owner text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  sensitivity text not null default 'internal' check (sensitivity in ('public', 'internal', 'confidential', 'restricted')),
  version integer not null default 1,
  review_at date,
  deletion_method text not null default 'Retire the item, then delete the row.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.memory_items is 'The company''s knowledge. Only approved items may be used in anything a customer reads. Restricted items never enter a model prompt.';
create trigger memory_items_touch before update on public.memory_items for each row execute function app.touch_updated_at();
