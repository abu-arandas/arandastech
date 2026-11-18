import { type Db, json } from '../lib/db';

/** Background work for the departments (blueprint 11.1, "job queue and scheduler"), kept in the jobs table. */
export interface JobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed';
  run_at: Date;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  idempotency_key: string | null;
  created_at: Date;
  finished_at: Date | null;
}

/**
 * Queues one job. The same key queues once, so an event that is seen twice (a repeated form, a webhook delivered
 * again) gives one run. Call it inside the transaction that records the event, so the two stand or fall together.
 */
export async function enqueue(
  db: Db,
  kind: string,
  payload: Record<string, unknown>,
  options: { key?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<{ id: string | null; queued: boolean }> {
  const rows = await db.query<{ id: string }>(
    `insert into jobs (kind, payload, idempotency_key, run_at, max_attempts) values ($1, $2::jsonb, $3, coalesce($4, now()), $5)
     on conflict (idempotency_key) do nothing returning id`,
    [kind, json(payload), options.key ?? null, options.runAt ?? null, options.maxAttempts ?? 4],
  );
  return { id: rows[0]?.id ?? null, queued: rows.length > 0 };
}

/** A job whose worker died is taken up again after this long. */
const STALE_MINUTES = 5;

/** Takes the next due job, so that two workers never run the same one. */
export async function claimJob(db: Db, now: Date): Promise<JobRow | null> {
  const stale = new Date(now.getTime() - STALE_MINUTES * 60_000);
  // A job whose worker died on its last attempt is not taken up again: it has used its attempts.
  await db.query(
    `update jobs set status = 'failed', locked_at = null, finished_at = $1, last_error = coalesce(last_error, 'The worker stopped before the job finished.')
     where status = 'running' and locked_at < $2 and attempts >= max_attempts`,
    [now, stale],
  );
  const rows = await db.query<JobRow>(
    `update jobs set status = 'running', locked_at = $1, attempts = attempts + 1
     where id = (
       select id from jobs
       where (status = 'queued' and run_at <= greatest($1::timestamptz, now())) or (status = 'running' and locked_at < $2 and attempts < max_attempts)
       order by run_at limit 1 for update skip locked)
     returning id, kind, payload, status, run_at, attempts, max_attempts, last_error, idempotency_key, created_at, finished_at`,
    [now, stale],
  );
  return rows[0] ?? null;
}

export async function finishJob(db: Db, id: string, now: Date): Promise<void> {
  await db.query(`update jobs set status = 'done', finished_at = $2, locked_at = null where id = $1`, [id, now]);
}

/** A failed job is tried again later, waiting longer each time, until it runs out of attempts. */
export async function failJob(db: Db, job: JobRow, error: string, now: Date): Promise<'retry' | 'failed'> {
  const last = job.attempts >= job.max_attempts;
  const wait = 2 ** job.attempts * 60_000;
  await db.query(
    `update jobs set status = $2, last_error = $3, locked_at = null, run_at = $4, finished_at = $5 where id = $1`,
    [job.id, last ? 'failed' : 'queued', error.slice(0, 1000), new Date(now.getTime() + wait), last ? now : null],
  );
  return last ? 'failed' : 'retry';
}

export async function listJobs(db: Db, limit = 50): Promise<JobRow[]> {
  return db.query<JobRow>(
    `select id, kind, payload, status, run_at, attempts, max_attempts, last_error, idempotency_key, created_at, finished_at
     from jobs order by created_at desc limit $1`,
    [limit],
  );
}
