import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkInstallMode, deployMigrations } from '../src/lib/migrate';
import { createPlatform, install } from '../src/platform';
import { createTestDb, type TestDb } from './helpers/db';

const secrets = { payments: 'test', supplier: 'test' };

describe('deploying to a hosted database', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await createTestDb({ empty: true });
  });
  afterAll(async () => test.drop());

  it('migrates an empty plain PostgreSQL once, then has nothing left to do', async () => {
    const first = await deployMigrations(test.db);
    expect(first.bootstrapped).toBe(true);
    expect(first.applied).toEqual([...first.applied].sort());
    expect(first.applied.length).toBeGreaterThanOrEqual(4);

    expect(await deployMigrations(test.db)).toEqual({ applied: [], bootstrapped: false });
    const recorded = await test.db.query<{ name: string }>('select name from ops.applied_migrations order by name');
    expect(recorded.map((row) => row.name)).toEqual(first.applied);
  });

  it('installs the starting data as drafts, and a second install adds nothing', async () => {
    const platform = createPlatform(test.db, { demo: false, webhookSecrets: secrets });
    await install(platform);
    const count = async () =>
      (await test.db.query<{ n: number }>('select count(*)::int as n from product_variants'))[0]!.n;
    const before = await count();
    await install(platform);
    expect(await count()).toBe(before);
    const published = await test.db.query(`select 1 from products where status = 'published'`);
    expect(published).toEqual([]);
  });

  it('keeps installing after the owner renames a product', async () => {
    const platform = createPlatform(test.db, { demo: true, webhookSecrets: secrets });
    await install(platform);
    await test.db.query(`update products set slug = 'retail' where slug = 'zirr-retail'`);
    await install(platform);
    expect(await test.db.query(`select slug from products where slug like '%retail'`)).toEqual([{ slug: 'retail' }]);
  });

  it('refuses a database that has the schema but no record of its migrations', async () => {
    const other = await createTestDb();
    try {
      await expect(deployMigrations(other.db)).rejects.toThrow(/no record of its migrations/);
      expect(await other.db.query(`select to_regclass('ops.applied_migrations') as t`)).toEqual([{ t: null }]);
    } finally {
      await other.drop();
    }
  });

  it('keeps a database in the mode it was installed in', async () => {
    const other = await createTestDb({ empty: true });
    try {
      await deployMigrations(other.db);
      await checkInstallMode(other.db, true);
      await checkInstallMode(other.db, true);
      await expect(checkInstallMode(other.db, false)).rejects.toThrow(/installed in demo mode/);
    } finally {
      await other.drop();
    }
  });
});
