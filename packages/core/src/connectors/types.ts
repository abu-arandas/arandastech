import type { Db } from '../lib/db';

export interface ConnectorContext {
  db: Db;
  /** The same key always produces the same effect once: a repeated call changes nothing. */
  idempotencyKey: string;
}

/** The adapter between the platform and one outside service (blueprint 9.1). */
export interface Connector {
  readonly id: string;
  readonly mode: 'mock' | 'live';
  execute(actionType: string, payload: Record<string, unknown>, ctx: ConnectorContext): Promise<Record<string, unknown>>;
  health(): Promise<{ ok: boolean; note: string }>;
}
