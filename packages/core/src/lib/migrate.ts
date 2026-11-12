import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db';

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'supabase');

/**
 * Applies every migration in supabase/migrations to an empty database, in file-name order.
 * `bootstrap` first adds the roles and auth.uid() that Supabase provides, for a plain PostgreSQL (local and CI).
 */
export async function applyMigrations(db: Db, options: { bootstrap: boolean }): Promise<string[]> {
  if (options.bootstrap) await db.query(readFileSync(join(supabaseDir, 'tests', 'bootstrap.sql'), 'utf8'));
  const files = readdirSync(join(supabaseDir, 'migrations')).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) await db.query(readFileSync(join(supabaseDir, 'migrations', file), 'utf8'));
  return files;
}
