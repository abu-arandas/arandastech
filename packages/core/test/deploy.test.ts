import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkInstallMode, deployMigrations } from '../src/lib/migrate';
import { chooseSecret, ensureSecrets, PLACEHOLDER, readSecrets, SECRETS } from '../src/lib/secrets';
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

  it('makes each secret once, keeps it, and closes it to the app roles', async () => {
    const names = Object.keys(SECRETS).sort();
    expect((await ensureSecrets(test.db)).sort()).toEqual(names);
    const first = await readSecrets(test.db);
    expect(Object.keys(first).sort()).toEqual(names);
    for (const value of Object.values(first)) expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Object.values(first)).size).toBe(names.length);

    expect(await ensureSecrets(test.db)).toEqual([]);
    expect(await readSecrets(test.db)).toEqual(first);

    for (const role of ['anon', 'authenticated']) {
      const [access] = await test.db.query<{ usage: boolean }>(
        `select has_schema_privilege($1, 'ops', 'usage') as usage`,
        [role],
      );
      expect(access?.usage).toBe(false);
    }
  });

  it('lets two first deploys run at once', async () => {
    const other = await createTestDb({ empty: true });
    try {
      const runs = await Promise.all([deployMigrations(other.db), deployMigrations(other.db)]);
      expect(runs.filter((run) => run.applied.length > 0)).toHaveLength(1);
      await Promise.all([checkInstallMode(other.db, true), checkInstallMode(other.db, true)]);
      const made = await Promise.all([ensureSecrets(other.db), ensureSecrets(other.db)]);
      expect(made.flat().sort()).toEqual(Object.keys(SECRETS).sort());
    } finally {
      await other.drop();
    }
  });

  it('never lets the example placeholder stand in for a secret on a hosted site', () => {
    expect(chooseSecret('set-by-owner', 'made-by-deploy', true)).toBe('set-by-owner');
    expect(chooseSecret(undefined, 'made-by-deploy', true)).toBe('made-by-deploy');
    expect(chooseSecret(PLACEHOLDER, 'made-by-deploy', true)).toBe('made-by-deploy');
    expect(chooseSecret(PLACEHOLDER, undefined, true)).toBeUndefined();
    expect(chooseSecret('', undefined, true)).toBeUndefined();
    expect(chooseSecret(PLACEHOLDER, undefined, false)).toBe(PLACEHOLDER);
  });

  it('reads no secrets from a database that was never deployed', async () => {
    const other = await createTestDb();
    try {
      expect(await readSecrets(other.db)).toEqual({});
    } finally {
      await other.drop();
    }
  });

  it('recognises a demo database installed before the mode was recorded', async () => {
    const other = await createTestDb({ empty: true });
    try {
      await deployMigrations(other.db);
      await install(createPlatform(other.db, { demo: true, webhookSecrets: secrets }));
      await expect(checkInstallMode(other.db, false)).rejects.toThrow(/installed in demo mode/);
    } finally {
      await other.drop();
    }
  });
});
