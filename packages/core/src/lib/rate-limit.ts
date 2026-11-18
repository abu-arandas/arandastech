import type { Db } from './db';
import { AppError } from './errors';
import { sha256 } from './hash';

/** What each limited door allows, per caller. */
export const LIMITS = {
  lead: { hits: 5, windowSeconds: 600, message: 'Too many messages from here. Please try again in a few minutes.' },
  checkout: {
    hits: 10,
    windowSeconds: 600,
    message: 'Too many checkouts from here. Please try again in a few minutes.',
  },
  sign_in: { hits: 20, windowSeconds: 900, message: 'Too many failed sign-ins from here. Wait a few minutes.' },
} as const;
export type LimitName = keyof typeof LIMITS;

/**
 * The caller, as a hash of the first forwarded address. Behind Vercel the first entry is the real client. The address
 * itself is never stored.
 */
export function callerKey(headers: Record<string, string>): string {
  const address = (headers['x-forwarded-for'] ?? headers['x-real-ip'] ?? 'unknown').split(',')[0]!.trim();
  return sha256(`rate:${address}`).slice(0, 32);
}

/** Counts one hit and refuses with 429 once the caller has used up the window. */
export async function limit(db: Db, name: LimitName, caller: string, now: Date): Promise<void> {
  const rule = LIMITS[name];
  const size = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / size) * size);
  const bucket = `${name}:${caller}`;
  const [row] = await db.query<{ hits: number }>(
    `insert into rate_limits (bucket, window_start, hits) values ($1, $2, 1)
     on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1 returning hits`,
    [bucket, windowStart],
  );
  // Windows older than a day are of no use; clearing this caller's keeps the table small without a scheduled job.
  await db.query('delete from rate_limits where bucket = $1 and window_start < $2', [
    bucket,
    new Date(now.getTime() - 86_400_000),
  ]);
  if ((row?.hits ?? 0) > rule.hits) {
    const retry = Math.ceil((windowStart.getTime() + size - now.getTime()) / 1000);
    throw new AppError('rate_limited', rule.message, 429, { retry_after_seconds: retry });
  }
}

/** Whether the caller is already over a limit, without counting a hit. */
export async function overLimit(db: Db, name: LimitName, caller: string, now: Date): Promise<boolean> {
  const rule = LIMITS[name];
  const size = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / size) * size);
  const [row] = await db.query<{ hits: number }>(
    'select hits from rate_limits where bucket = $1 and window_start = $2',
    [`${name}:${caller}`, windowStart],
  );
  return (row?.hits ?? 0) >= rule.hits;
}
