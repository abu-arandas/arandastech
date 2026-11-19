import pg from 'pg';

// int8 comes back as a string by default. Money is stored as whole minor units, which fit safely in a number.
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`bigint ${value} does not fit in a safe integer`);
  return n;
});

// A date without a time (an invoice's due date) comes back as written, "2026-11-26", never shifted by a time zone.
pg.types.setTypeParser(1082, (value) => value);

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

/**
 * A connection that broke before or between queries: the server closed an idle one, or the TLS handshake was cut.
 * Hosted Postgres poolers (Neon) close idle connections, and a frozen serverless function wakes up holding them.
 */
export function isConnectionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'ECONNRESET' || e.code === 'EPIPE' || e.code === 'ETIMEDOUT' || e.code === '57P01') return true;
  return /Connection terminated|socket disconnected|Client has encountered a connection error/i.test(e.message ?? '');
}

/** Only a plain read is safe to send twice: a write may have reached the server before the connection broke. */
const isRead = (text: string): boolean => /^\s*select\b/i.test(text);

class PoolDb implements Db {
  constructor(private readonly pool: pg.Pool) {}

  /** A pooled connection. A failure to connect is tried once more, since nothing was sent yet. */
  private async connect(): Promise<pg.PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      return this.pool.connect();
    }
  }

  async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    for (let attempt = 1; ; attempt++) {
      const client = await this.connect();
      try {
        const rows = (await client.query(text, params)).rows as T[];
        client.release();
        return rows;
      } catch (error) {
        // A broken connection is thrown away, not given back to the pool.
        const broken = isConnectionError(error);
        client.release(broken ? (error as Error) : undefined);
        if (broken && attempt === 1 && isRead(text)) continue;
        throw error;
      }
    }
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.connect();
    try {
      await client.query('begin');
      const out = await fn(new ClientDb(client, 0));
      await client.query('commit');
      client.release();
      return out;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      client.release(isConnectionError(error) ? (error as Error) : undefined);
      throw error;
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export function createDb(connectionString: string, max = 10): Db {
  // Idle connections are closed by us well before a hosted pooler would close them under us.
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  // An idle connection that breaks is dropped by the pool; without a listener it would crash the process.
  pool.on('error', () => undefined);
  return new PoolDb(pool);
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
