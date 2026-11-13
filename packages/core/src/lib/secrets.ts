import { randomBytes } from 'node:crypto';
import type { Db } from './db';

/** The secrets an installation needs. Each one is a setting the site reads, named in apps/web/.env.example. */
export const SECRETS = {
  owner_api_token: 'OWNER_API_TOKEN',
  payments_webhook_secret: 'PAYMENTS_WEBHOOK_SECRET',
  supplier_webhook_secret: 'SUPPLIER_WEBHOOK_SECRET',
} as const;

export type SecretName = keyof typeof SECRETS;

/**
 * Makes each missing secret once and keeps it in ops.secrets, so no person or tool has to make, copy or paste it.
 * A secret that already exists is never changed. Returns the names it made, never the values.
 * Run after deployMigrations, which creates the ops schema and closes it to everyone but the database owner.
 */
export async function ensureSecrets(db: Db): Promise<SecretName[]> {
  await db.query(
    `create table if not exists ops.secrets (name text primary key, value text not null, created_at timestamptz not null default now())`,
  );
  const made: SecretName[] = [];
  for (const name of Object.keys(SECRETS) as SecretName[]) {
    const rows = await db.query(
      `insert into ops.secrets (name, value) values ($1, $2) on conflict (name) do nothing returning name`,
      [name, randomBytes(32).toString('base64url')],
    );
    if (rows.length) made.push(name);
  }
  return made;
}

/** The secrets kept in the database. Empty when the database was never deployed with db:deploy, as in local development. */
export async function readSecrets(db: Db): Promise<Partial<Record<SecretName, string>>> {
  const [table] = await db.query<{ present: boolean }>(`select to_regclass('ops.secrets') is not null as present`);
  if (!table?.present) return {};
  const rows = await db.query<{ name: SecretName; value: string }>(`select name, value from ops.secrets`);
  return Object.fromEntries(rows.map((row) => [row.name, row.value]));
}
