-- Row-level security on every table (blueprint 11.4 rule 6).
--
-- The model is deliberately simple:
--   * anon              no access at all. The public site reads through the server, never from a browser.
--   * authenticated     an active staff member may read. Nobody writes from a client.
--   * service_role      the platform service. It writes, and the rules in packages/core decide what it may write.
--
-- Run app.secure_all_tables() again at the end of any later migration that adds a table.

create function app.secure_all_tables() returns void
language plpgsql set search_path = '' as $$
declare
  t record;
begin
  for t in select c.relname as name from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t.name);
    execute format('revoke all on public.%I from anon, authenticated', t.name);
    execute format('grant select on public.%I to authenticated', t.name);
    execute format('grant all on public.%I to service_role', t.name);
    execute format('drop policy if exists staff_read on public.%I', t.name);
    execute format('create policy staff_read on public.%I for select to authenticated using ((select app.is_staff()))', t.name);
  end loop;
end;
$$;

select app.secure_all_tables();

grant usage on schema app to authenticated, service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on all sequences in schema public from anon, authenticated;
