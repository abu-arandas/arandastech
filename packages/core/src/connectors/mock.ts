import { type Db, json } from '../lib/db';
import { sha256 } from '../lib/hash';
import type { Connector, ConnectorContext } from './types';

type ResultFor = (actionType: string, payload: Record<string, unknown>, key: string) => Record<string, unknown>;

/**
 * A stand-in for a live connector. It records what it would have sent in mock_deliveries and behaves like the real
 * thing where it matters: the same idempotency key delivers once, and failures can be rehearsed.
 */
export class MockConnector implements Connector {
  readonly mode = 'mock' as const;
  private failures: Error[] = [];

  constructor(
    readonly id: string,
    private readonly resultFor: ResultFor,
  ) {}

  /** Makes the next `times` calls fail, to rehearse timeouts, rate limits and expired tokens. */
  failNext(message: string, times = 1): void {
    for (let i = 0; i < times; i += 1) this.failures.push(new Error(message));
  }

  async execute(actionType: string, payload: Record<string, unknown>, ctx: ConnectorContext): Promise<Record<string, unknown>> {
    const failure = this.failures.shift();
    if (failure) throw failure;
    const existing = await ctx.db.query<{ result: Record<string, unknown> }>(
      'select result from mock_deliveries where idempotency_key = $1',
      [ctx.idempotencyKey],
    );
    if (existing[0]) return existing[0].result;
    const result = this.resultFor(actionType, payload, ctx.idempotencyKey);
    await ctx.db.query(
      `insert into mock_deliveries (connector, action_type, idempotency_key, payload, result) values ($1, $2, $3, $4::jsonb, $5::jsonb)
       on conflict (idempotency_key) do nothing`,
      [this.id, actionType, ctx.idempotencyKey, json(payload), json(result)],
    );
    return result;
  }

  async health(): Promise<{ ok: boolean; note: string }> {
    return { ok: true, note: 'Mock connector. No live account is connected.' };
  }
}

const ref = (prefix: string, key: string): string => `${prefix}_${sha256(key).slice(0, 12)}`;

/** The mock connectors of the first build (blueprint 15). Each returns the kind of reference its provider would. */
export function createMockConnectors(): Record<string, MockConnector> {
  return {
    gmail: new MockConnector('gmail', (type, _payload, key) => (type === 'gmail.create_draft' ? { draft_id: ref('draft', key) } : { message_id: ref('msg', key) })),
    whatsapp: new MockConnector('whatsapp', (_type, _payload, key) => ({ message_id: ref('wamid', key) })),
    buffer: new MockConnector('buffer', (_type, _payload, key) => ({ post_id: ref('post', key) })),
    github: new MockConnector('github', (type, payload, key) =>
      type === 'github.create_issue'
        ? { number: (parseInt(sha256(key).slice(0, 6), 16) % 900) + 100, repository: payload.repository }
        : { merged: true, sha: sha256(key).slice(0, 40) },
    ),
    vercel: new MockConnector('vercel', (_type, payload, key) => ({ url: `https://${String(payload.project)}-${sha256(key).slice(0, 8)}.example.test` })),
    payments: new MockConnector('payments', (type, _payload, key) => (type === 'payments.refund' ? { refund_ref: ref('re', key) } : { invoice_ref: ref('inv', key) })),
    supplier: new MockConnector('supplier', (_type, _payload, key) => ({ supplier_ref: ref('so', key), tracking: null })),
  };
}

export async function listMockDeliveries(db: Db, connector?: string): Promise<Array<{ connector: string; action_type: string; payload: Record<string, unknown>; result: Record<string, unknown>; at: Date }>> {
  return connector
    ? db.query('select connector, action_type, payload, result, at from mock_deliveries where connector = $1 order by at', [connector])
    : db.query('select connector, action_type, payload, result, at from mock_deliveries order by at');
}
