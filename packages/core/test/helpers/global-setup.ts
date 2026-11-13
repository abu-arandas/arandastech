import { createDb } from '../../src/lib/db';
import { applyMigrations } from '../../src/lib/migrate';

export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://zirr:zirr@localhost:5432/postgres';
export const TEMPLATE = 'zirr_test_template';

const withDatabase = (url: string, name: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
};

/** Builds one migrated template database. Each test file then copies it, which is much faster than migrating again. */
export default async function setup(): Promise<void> {
  const admin = createDb(ADMIN_URL, 1);
  await admin.query(`drop database if exists ${TEMPLATE} with (force)`);
  await admin.query(`create database ${TEMPLATE}`);
  await admin.close();
  const template = createDb(withDatabase(ADMIN_URL, TEMPLATE), 1);
  await applyMigrations(template, { bootstrap: true });
  await template.close();
}

export { withDatabase };
