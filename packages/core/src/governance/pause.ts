import type { Db } from '../lib/db';
import { forbidden } from '../lib/errors';
import type { Actor } from '../lib/types';
import { audit } from './audit';

export type PauseScope = 'global' | 'connector' | 'department' | 'product' | 'supplier' | 'orders' | 'advertising' | 'fulfillment' | 'rule';

export interface PauseTarget {
  scope: PauseScope;
  /** What is paused inside the scope: a connector id, a product id. `*` means the whole scope. */
  target?: string;
}

/** Anyone may pause: the owner, a team member, or the Security Agent. */
export async function pause(db: Db, what: PauseTarget, reason: string, by: Actor): Promise<void> {
  const target = what.target ?? '*';
  await db.tx(async (tx) => {
    await tx.query(
      `insert into pause_flags (scope, target, paused, reason, set_by_kind, set_by_id) values ($1, $2, true, $3, $4, $5)
       on conflict (scope, target) do update set paused = true, reason = excluded.reason,
         set_by_kind = excluded.set_by_kind, set_by_id = excluded.set_by_id, set_at = now()`,
      [what.scope, target, reason, by.kind, by.id],
    );
    await audit(tx, { actor: by, type: 'pause.set', subject: { type: 'pause', id: `${what.scope}:${target}` }, data: { reason } });
  });
}

/** Only the owner resumes. The caller passes whether the actor is the owner; an agent never is. */
export async function resume(db: Db, what: PauseTarget, by: Actor, isOwner: boolean): Promise<void> {
  if (!isOwner || by.kind !== 'person') throw forbidden('Only the owner can end a pause.');
  const target = what.target ?? '*';
  await db.tx(async (tx) => {
    await tx.query(
      `update pause_flags set paused = false, set_by_kind = $3, set_by_id = $4, set_at = now() where scope = $1 and target = $2`,
      [what.scope, target, by.kind, by.id],
    );
    await audit(tx, { actor: by, type: 'pause.ended', subject: { type: 'pause', id: `${what.scope}:${target}` } });
  });
}

/**
 * The first active pause that covers any of the given targets, or null. Read on every action, never cached
 * (blueprint 11.4 rule 7). The global pause always counts.
 */
export async function activePause(db: Db, targets: PauseTarget[]): Promise<{ scope: string; target: string; reason: string } | null> {
  const wanted: Array<[string, string]> = [['global', '*']];
  for (const t of targets) {
    wanted.push([t.scope, '*']);
    if (t.target && t.target !== '*') wanted.push([t.scope, t.target]);
  }
  const rows = await db.query<{ scope: string; target: string; reason: string }>(
    `select scope, target, reason from pause_flags
     where paused and (scope, target) in (select * from unnest($1::text[], $2::text[]))
     order by (scope = 'global') desc limit 1`,
    [wanted.map((w) => w[0]), wanted.map((w) => w[1])],
  );
  return rows[0] ?? null;
}

export async function listPauses(db: Db): Promise<Array<{ scope: string; target: string; paused: boolean; reason: string; set_at: Date; set_by_kind: string; set_by_id: string | null }>> {
  return db.query('select scope, target, paused, reason, set_at, set_by_kind, set_by_id from pause_flags order by paused desc, set_at desc');
}
