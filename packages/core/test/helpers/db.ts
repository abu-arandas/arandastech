import { randomBytes } from 'node:crypto';
import { createDb, type Db } from '../../src/lib/db';
import { ADMIN_URL, TEMPLATE, withDatabase } from './global-setup';

export interface TestDb {
  db: Db;
  drop(): Promise<void>;
}

/** A fresh, fully migrated database for one test file, or an empty one with `empty`. */
export async function createTestDb(options: { empty?: boolean } = {}): Promise<TestDb> {
  const name = `zirr_test_${randomBytes(6).toString('hex')}`;
  const admin = createDb(ADMIN_URL, 1);
  await admin.query(options.empty ? `create database ${name}` : `create database ${name} template ${TEMPLATE}`);
  await admin.close();
  const db = createDb(withDatabase(ADMIN_URL, name), 5);
  return {
    db,
    async drop() {
      await db.close();
      const again = createDb(ADMIN_URL, 1);
      await again.query(`drop database if exists ${name} with (force)`);
      await again.close();
    },
  };
}

/** A clock the test moves by hand. */
export function testClock(start = '2026-11-15T09:00:00.000Z'): { now: () => Date; advance: (hours: number) => void } {
  let current = new Date(start).getTime();
  return { now: () => new Date(current), advance: (hours) => void (current += hours * 3_600_000) };
}
