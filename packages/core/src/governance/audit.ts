import { type Db, json } from '../lib/db';
import type { Actor } from '../lib/types';

export interface AuditEntry {
  actor: Actor;
  /** What happened, as `area.event`: `action.proposed`, `approval.approved`, `order.paid`. */
  type: string;
  subject?: { type: string; id: string };
  data?: Record<string, unknown>;
}

/** Appends one entry to the audit log. The database numbers it and chains its hash. */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_events (actor_kind, actor_id, event_type, subject_type, subject_id, data)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [entry.actor.kind, entry.actor.id, entry.type, entry.subject?.type ?? null, entry.subject?.id ?? null, json(entry.data ?? {})],
  );
}

/** The seq of the first entry whose hash or link is wrong, or null when the chain is intact. */
export async function verifyAuditChain(db: Db): Promise<number | null> {
  const rows = await db.query<{ broken: number | null }>('select app.verify_audit_chain() as broken');
  return rows[0]?.broken ?? null;
}
