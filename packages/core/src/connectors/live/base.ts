import { json } from '../../lib/db';
import type { Connector, ConnectorContext } from '../types';

/** The fetch the live connectors use. Tests pass their own, so no test ever reaches a real provider. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** An error from an outside provider, with the provider's own words when it gave any. Secrets never appear in it. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    detail: string,
  ) {
    super(`${provider} answered ${status}: ${detail.slice(0, 300)}`);
  }
}

/** Calls a provider with a time limit and turns a refusal into a ProviderError. Returns the parsed JSON, or {}. */
export async function request<T = Record<string, unknown>>(
  fetcher: Fetch,
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetcher(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ProviderError(provider, 0, error instanceof Error ? error.message : String(error));
  }
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  if (!response.ok) throw new ProviderError(provider, response.status, providerMessage(body) ?? text);
  return body as T;
}

function providerMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const error = b.error;
  if (typeof error === 'string')
    return typeof b.error_description === 'string' ? `${error}: ${b.error_description}` : error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string')
    return (error as { message: string }).message;
  if (typeof b.message === 'string') return b.message;
  if (Array.isArray(b.errors) && b.errors[0] && typeof (b.errors[0] as { message?: unknown }).message === 'string')
    return (b.errors[0] as { message: string }).message;
  return null;
}

/**
 * A connector that reaches a real account. The same idempotency key reaches the provider once: the result is kept in
 * connector_calls, so a retried action returns what the first call returned instead of sending twice.
 */
export abstract class LiveConnector implements Connector {
  readonly mode = 'live' as const;
  abstract readonly id: string;

  protected abstract call(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  abstract health(): Promise<{ ok: boolean; note: string }>;

  async execute(
    actionType: string,
    payload: Record<string, unknown>,
    ctx: ConnectorContext,
  ): Promise<Record<string, unknown>> {
    const done = await ctx.db.query<{ result: Record<string, unknown> }>(
      'select result from connector_calls where idempotency_key = $1',
      [ctx.idempotencyKey],
    );
    if (done[0]) return done[0].result;
    const result = await this.call(actionType, payload);
    await ctx.db.query(
      `insert into connector_calls (connector, action_type, idempotency_key, result) values ($1, $2, $3, $4::jsonb)
       on conflict (idempotency_key) do nothing`,
      [this.id, actionType, ctx.idempotencyKey, json(result)],
    );
    return result;
  }
}

export const unknownAction = (connector: string, actionType: string): Error =>
  new Error(`${connector} cannot do ${actionType}`);
