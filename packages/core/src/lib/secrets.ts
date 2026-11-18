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
 * Run after deployMigrations, which creates ops.secrets and closes the ops schema to everyone but the database owner.
 */
export async function ensureSecrets(db: Db): Promise<SecretName[]> {
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

/** The departments that get their own MCP token for the bots in OpenMausBot or another MCP client. */
const AGENT_DEPARTMENTS = [
  'operations',
  'engineering',
  'marketing',
  'sales',
  'support',
  'commerce',
  'finance',
  'security',
];

/**
 * Makes one MCP token per department, once, in ops.secrets as agent_token:<department>, so the owner can connect a bot
 * (OpenMausBot, Claude Code or Claude Desktop) by reading its token in the SQL editor. Returns how many it made.
 */
export async function ensureAgentTokens(db: Db): Promise<number> {
  let made = 0;
  for (const department of AGENT_DEPARTMENTS) {
    const rows = await db.query(
      `insert into ops.secrets (name, value) values ($1, $2) on conflict (name) do nothing returning name`,
      [`agent_token:${department}`, randomBytes(32).toString('base64url')],
    );
    made += rows.length;
  }
  return made;
}

/** The department tokens kept in the database, as the API wants them: token to department. */
export async function readAgentTokens(db: Db): Promise<Record<string, string>> {
  const [table] = await db.query<{ present: boolean }>(`select to_regclass('ops.secrets') is not null as present`);
  if (!table?.present) return {};
  const rows = await db.query<{ name: string; value: string }>(
    `select name, value from ops.secrets where starts_with(name, 'agent_token:')`,
  );
  return Object.fromEntries(rows.map((row) => [row.value, row.name.slice('agent_token:'.length)]));
}

/**
 * A key the owner keeps in the database instead of a setting, such as anthropic_api_key. Never made automatically:
 * it belongs to an outside account, so only the owner puts it there.
 */
export async function readStoredKey(db: Db, name: 'anthropic_api_key'): Promise<string | undefined> {
  const [table] = await db.query<{ present: boolean }>(`select to_regclass('ops.secrets') is not null as present`);
  if (!table?.present) return undefined;
  const rows = await db.query<{ value: string }>(`select value from ops.secrets where name = $1`, [name]);
  return rows[0]?.value.trim() || undefined;
}

/** The value apps/web/.env.example gives each secret. It is known to everyone, so it never stands in for a real one. */
export const PLACEHOLDER = 'change-me';

/**
 * Picks the secret the site uses: a real setting first, then the one db:deploy kept in the database.
 * The example's placeholder counts as unset. Only a local run, not a hosted one, may fall back to it.
 */
export function chooseSecret(
  setting: string | undefined,
  stored: string | undefined,
  hosted: boolean,
): string | undefined {
  if (setting && setting !== PLACEHOLDER) return setting;
  if (stored) return stored;
  return hosted ? undefined : setting || undefined;
}

/** The secrets kept in the database. Empty when the database was never deployed with db:deploy, as in local development. */
export async function readSecrets(db: Db): Promise<Partial<Record<SecretName, string>>> {
  const [table] = await db.query<{ present: boolean }>(`select to_regclass('ops.secrets') is not null as present`);
  if (!table?.present) return {};
  const rows = await db.query<{ name: SecretName; value: string }>(
    `select name, value from ops.secrets where name = any($1)`,
    [Object.keys(SECRETS)],
  );
  return Object.fromEntries(rows.map((row) => [row.name, row.value]));
}
