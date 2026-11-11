import pg from 'pg';

// int8 comes back as a string by default. Money is stored as whole minor units, which fit safely in a number.
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`bigint ${value} does not fit in a safe integer`);
  return n;
});

export type Row = Record<string, unknown>;

/** A database handle. `tx` nests: inside a transaction it opens a savepoint. */
export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class ClientDb implements Db {
  constructor(
    private readonly client: pg.PoolClient,
    private readonly depth: number,
  ) {}

  async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await this.client.query(text, params)).rows as T[];
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const name = `sp_${this.depth + 1}`;
    await this.client.query(`savepoint ${name}`);
    try {
      const out = await fn(new ClientDb(this.client, this.depth + 1));
      await this.client.query(`release savepoint ${name}`);
      return out;
    } catch (error) {
      await this.client.query(`rollback to savepoint ${name}`);
      throw error;
    }
  }

  async close(): Promise<void> {}
}

class PoolDb implements Db {
  constructor(private readonly pool: pg.Pool) {}

  async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pool.query(text, params)).rows as T[];
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const out = await fn(new ClientDb(client, 0));
      await client.query('commit');
      return out;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export function createDb(connectionString: string, max = 10): Db {
  return new PoolDb(new pg.Pool({ connectionString, max }));
}

/** The only row of a result that must have exactly one. */
export function one<T>(rows: T[], what = 'row'): T {
  if (rows.length !== 1) throw new Error(`expected one ${what}, found ${rows.length}`);
  return rows[0] as T;
}

export function maybeOne<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

/** A value for a jsonb parameter. node-postgres would turn a bare array into a Postgres array, so always go through this. */
export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}
