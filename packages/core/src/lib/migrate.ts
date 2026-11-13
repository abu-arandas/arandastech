import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db';

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'supabase');

const migrationFiles = (): string[] =>
  readdirSync(join(supabaseDir, 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
const readMigration = (file: string): string => readFileSync(join(supabaseDir, 'migrations', file), 'utf8');
const readBootstrap = (): string => readFileSync(join(supabaseDir, 'tests', 'bootstrap.sql'), 'utf8');

/**
 * Applies every migration in supabase/migrations to an empty database, in file-name order.
 * `bootstrap` first adds the roles and auth.uid() that Supabase provides, for a plain PostgreSQL (local and CI).
 */
export async function applyMigrations(db: Db, options: { bootstrap: boolean }): Promise<string[]> {
  if (options.bootstrap) await db.query(readBootstrap());
  const files = migrationFiles();
  for (const file of files) await db.query(readMigration(file));
  return files;
}

/**
 * Brings a hosted database up to date, so it can run on every deploy.
 * Applies only the migrations the database has not had yet and records each one in ops.applied_migrations.
 * Everything happens in one transaction under a lock, so two deploys cannot race and a failure changes nothing.
 * On a plain PostgreSQL (Neon, for example) it first adds the roles and auth.uid() that Supabase provides.
 */
export async function deployMigrations(db: Db): Promise<{ applied: string[]; bootstrapped: boolean }> {
  return db.tx(async (t) => {
    await t.query(`select pg_advisory_xact_lock(hashtext('zirr.deploy_migrations'))`);
    await t.query(`create schema if not exists ops`);
    await t.query(`revoke all on schema ops from public`);
    await t.query(
      `create table if not exists ops.applied_migrations (name text primary key, applied_at timestamptz not null default now())`,
    );

    const [auth] = await t.query<{ present: boolean }>(`select to_regprocedure('auth.uid()') is not null as present`);
    const bootstrapped = !auth?.present;
    if (bootstrapped) await t.query(readBootstrap());

    const done = new Set(
      (await t.query<{ name: string }>(`select name from ops.applied_migrations`)).map((row) => row.name),
    );
    if (done.size === 0) {
      const [schema] = await t.query<{ present: boolean }>(
        `select to_regclass('public.currencies') is not null as present`,
      );
      if (schema?.present)
        throw new Error(
          'This database already has the schema but no record of its migrations. Record them in ops.applied_migrations before deploying.',
        );
    }

    const applied: string[] = [];
    for (const file of migrationFiles()) {
      if (done.has(file)) continue;
      await t.query(readMigration(file));
      await t.query(`insert into ops.applied_migrations (name) values ($1)`, [file]);
      applied.push(file);
    }
    return { applied, bootstrapped };
  });
}

/**
 * Remembers whether a database was installed in demo mode, and refuses to switch either way.
 * Demo mode publishes the catalog and adds a demo owner and a test product. None of that may reach live customers,
 * so a live install needs a database of its own. Run after deployMigrations, which creates the ops schema.
 */
export async function checkInstallMode(db: Db, demo: boolean): Promise<void> {
  const wanted = demo ? 'demo' : 'live';
  await db.query(
    `create table if not exists ops.install (key text primary key, value text not null, set_at timestamptz not null default now())`,
  );
  await db.query(`insert into ops.install (key, value) values ('mode', $1) on conflict (key) do nothing`, [wanted]);
  const [row] = await db.query<{ value: string }>(`select value from ops.install where key = 'mode'`);
  if (row?.value !== wanted)
    throw new Error(
      `This database was installed in ${row?.value} mode, but DEMO_MODE asks for ${wanted} mode. Use a fresh database for ${wanted} mode.`,
    );
}
