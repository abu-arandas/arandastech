import { type Db, json, maybeOne, one } from '../lib/db';
import { conflict, forbidden, invalid, notFound } from '../lib/errors';
import { payloadHash } from '../lib/hash';
import type { Actor } from '../lib/types';
import { actionSpec, levelOf } from './actions';
import { audit } from './audit';
import type { Guard } from './policy';
import { getPolicy } from './settings';

export interface ActionRow {
  id: string;
  action_type: string;
  connector: string;
  level: number;
  status: 'proposed' | 'blocked' | 'auto_approved' | 'pending' | 'approved' | 'rejected' | 'expired' | 'executing' | 'executed' | 'failed';
  payload: Record<string, unknown>;
  payload_hash: string;
  summary: string;
  recipient: string | null;
  cost_minor: number;
  currency: string | null;
  reversible: boolean;
  risk: string;
  expected_result: string;
  evidence: unknown[];
  reasons: string[];
  requested_by_kind: Actor['kind'];
  requested_by_id: string | null;
  agent_run_id: string | null;
  task_id: string | null;
  standing_rule_id: string | null;
  idempotency_key: string;
  untrusted_input: boolean;
  held_reason: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  created_at: Date;
  decided_at: Date | null;
  executed_at: Date | null;
}

export interface ApprovalRequestRow {
  id: string;
  action_id: string;
  level: number;
  payload_hash: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expires_at: Date;
  postponed_until: Date | null;
  batch_key: string | null;
  created_at: Date;
}

export interface DecisionInput {
  decision: 'approve' | 'reject' | 'postpone';
  by: Actor;
  isOwner: boolean;
  /** The owner's own version of the payload. It replaces the proposed one, and both are kept. */
  editedPayload?: unknown;
  /** Level 3 only: the owner repeats the amount and the recipient, so that one tap is never enough. */
  confirmation?: { amount_minor: number; recipient: string };
  note?: string;
  postponeHours?: number;
}

export async function createApprovalRequest(db: Db, action: ActionRow, now: Date): Promise<ApprovalRequestRow> {
  const hours = await getPolicy(db, 'approvals.expiry_hours');
  return one(
    await db.query<ApprovalRequestRow>(
      `insert into approval_requests (action_id, level, payload_hash, expires_at, batch_key, created_at) values ($1, $2, $3, $4, $5, $6) returning *`,
      [action.id, action.level, action.payload_hash, new Date(now.getTime() + hours * 3_600_000), action.level === 2 ? action.action_type : null, now],
    ),
  );
}

export interface OpenApproval extends ApprovalRequestRow {
  action: ActionRow;
}

/** Requests that wait for the owner, riskiest and soonest to expire first (blueprint 8.4). */
export async function listOpenApprovals(db: Db, now: Date): Promise<OpenApproval[]> {
  const rows = await db.query<ApprovalRequestRow & { action: ActionRow }>(
    `select r.*, to_jsonb(a.*) as action from approval_requests r join actions a on a.id = r.action_id
     where r.status = 'pending' and (r.postponed_until is null or r.postponed_until <= $1)
     order by r.level desc, r.expires_at asc`,
    [now],
  );
  return rows;
}

async function lapse(db: Db, request: ApprovalRequestRow): Promise<void> {
  await db.query(`update approval_requests set status = 'expired' where id = $1`, [request.id]);
  await db.query(`update actions set status = 'expired', decided_at = now() where id = $1 and status = 'pending'`, [request.action_id]);
  await db.query(`insert into approval_decisions (request_id, decision, note) values ($1, 'expire', 'No decision before the expiry time.')`, [request.id]);
  await audit(db, { actor: { kind: 'system', id: null }, type: 'approval.expired', subject: { type: 'action', id: request.action_id }, data: { request_id: request.id } });
}

/** Silence is a no: a request that reaches its expiry lapses, and nothing is ever approved by default. */
export async function expireDueApprovals(db: Db, now: Date): Promise<number> {
  return db.tx(async (tx) => {
    const due = await tx.query<ApprovalRequestRow>(`select * from approval_requests where status = 'pending' and expires_at <= $1 for update`, [now]);
    for (const request of due) await lapse(tx, request);
    return due.length;
  });
}

export interface DecisionResult {
  request: ApprovalRequestRow;
  action: ActionRow;
  approved: boolean;
}

/**
 * Records the owner's decision on one request (blueprint 2.4). Approval is tied to the exact payload, an edit is the
 * owner's version, Level 3 takes a deliberate confirmation, and every decision is written to the audit log.
 */
export async function decideApproval(db: Db, requestId: string, input: DecisionInput, now: Date, guardsFor: (type: string) => Guard[]): Promise<DecisionResult> {
  if (!input.isOwner || input.by.kind !== 'person' || !input.by.id) throw forbidden('Only the owner can decide an approval request.');

  const outcome = await db.tx(async (tx): Promise<DecisionResult | { lapsed: true } | { changed: true }> => {
    const request = maybeOne(await tx.query<ApprovalRequestRow>('select * from approval_requests where id = $1 for update', [requestId]));
    if (!request) throw notFound('approval request');
    const action = one(await tx.query<ActionRow>('select * from actions where id = $1 for update', [request.action_id]), 'action');
    if (request.status !== 'pending' || action.status !== 'pending') throw conflict(`this request is already ${request.status}`);

    if (now >= request.expires_at) {
      await lapse(tx, request);
      return { lapsed: true };
    }

    if (input.decision === 'reject') {
      await tx.query(`update approval_requests set status = 'rejected' where id = $1`, [request.id]);
      const rejected = one(await tx.query<ActionRow>(`update actions set status = 'rejected', decided_at = $2 where id = $1 returning *`, [action.id, now]));
      await tx.query(`insert into approval_decisions (request_id, decision, decided_by, note) values ($1, 'reject', $2, $3)`, [request.id, input.by.id, input.note ?? null]);
      await audit(tx, { actor: input.by, type: 'approval.rejected', subject: { type: 'action', id: action.id }, data: { request_id: request.id, note: input.note ?? null } });
      return { request: { ...request, status: 'rejected' }, action: rejected, approved: false };
    }

    if (input.decision === 'postpone') {
      const hours = input.postponeHours ?? 24;
      if (!(hours > 0 && hours <= 168)) throw invalid('a request can be postponed for 1 to 168 hours');
      const until = new Date(now.getTime() + hours * 3_600_000);
      const expires = new Date(Math.max(request.expires_at.getTime(), until.getTime() + 24 * 3_600_000));
      const postponed = one(await tx.query<ApprovalRequestRow>(`update approval_requests set postponed_until = $2, expires_at = $3 where id = $1 returning *`, [request.id, until, expires]));
      await tx.query(`insert into approval_decisions (request_id, decision, decided_by, note) values ($1, 'postpone', $2, $3)`, [request.id, input.by.id, input.note ?? null]);
      await audit(tx, { actor: input.by, type: 'approval.postponed', subject: { type: 'action', id: action.id }, data: { request_id: request.id, until: until.toISOString() } });
      return { request: postponed, action, approved: false };
    }

    // What is approved is what runs. A payload that no longer matches the request voids it.
    if (payloadHash(action.payload) !== request.payload_hash || action.payload_hash !== request.payload_hash) {
      await tx.query(`update approval_requests set status = 'rejected' where id = $1`, [request.id]);
      await tx.query(`insert into approval_decisions (request_id, decision, note) values ($1, 'reject', 'The payload changed after the request was raised.')`, [request.id]);
      await tx.query(`update actions set status = 'rejected', decided_at = $2 where id = $1`, [action.id, now]);
      await audit(tx, { actor: { kind: 'system', id: null }, type: 'approval.voided', subject: { type: 'action', id: action.id }, data: { request_id: request.id } });
      return { changed: true };
    }

    const spec = actionSpec(action.action_type);
    if (!spec) throw conflict(`the action type ${action.action_type} no longer exists`);
    let payload = action.payload;
    let edited: Record<string, unknown> | null = null;
    if (input.editedPayload !== undefined) {
      const parsed = spec.schema.safeParse(input.editedPayload);
      if (!parsed.success) throw invalid('the edited payload is not valid', parsed.error.issues);
      edited = parsed.data;
      payload = parsed.data;
      for (const guard of guardsFor(action.action_type)) {
        const reasons = await guard(tx, payload, input.by);
        if (reasons.length) throw invalid(`the edited payload is blocked: ${reasons.join('; ')}`);
      }
    }
    const level = levelOf(spec, payload);
    const cost = spec.cost?.(payload) ?? null;
    const recipient = spec.recipient?.(payload) ?? null;

    if (level === 3) {
      const confirmed = input.confirmation;
      if (!confirmed) throw invalid('A Level 3 action needs the amount and the recipient to be confirmed.');
      if (confirmed.amount_minor !== (cost?.amount ?? 0) || confirmed.recipient.trim().toLowerCase() !== (recipient ?? '').toLowerCase()) {
        throw invalid('The confirmed amount or recipient does not match the request.');
      }
      if (cost) {
        const thresholds = await getPolicy(tx, 'approvals.second_check_minor');
        const threshold = thresholds[cost.currency] ?? null;
        const waitHours = await getPolicy(tx, 'approvals.cooling_off_hours');
        const earliest = new Date(request.created_at.getTime() + waitHours * 3_600_000);
        if (threshold !== null && cost.amount >= threshold && now < earliest) {
          throw conflict(`This amount needs a second check. It can be approved from ${earliest.toISOString()}.`);
        }
      }
    }

    const finalHash = payloadHash(payload);
    const approved = one(
      await tx.query<ActionRow>(
        `update actions set status = 'approved', decided_at = $2, payload = $3::jsonb, payload_hash = $4, level = $5,
           summary = $6, recipient = $7, cost_minor = $8, currency = $9 where id = $1 returning *`,
        [action.id, now, json(payload), finalHash, level, spec.summarize(payload), recipient, cost?.amount ?? 0, cost?.currency ?? null],
      ),
    );
    const updated = one(await tx.query<ApprovalRequestRow>(`update approval_requests set status = 'approved', payload_hash = $2 where id = $1 returning *`, [request.id, finalHash]));
    await tx.query(
      `insert into approval_decisions (request_id, decision, decided_by, original_payload, edited_payload, final_payload_hash, confirmation, note)
       values ($1, 'approve', $2, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)`,
      [request.id, input.by.id, json(action.payload), edited ? json(edited) : null, finalHash, input.confirmation ? json(input.confirmation) : null, input.note ?? null],
    );
    await audit(tx, {
      actor: input.by,
      type: 'approval.approved',
      subject: { type: 'action', id: action.id },
      data: { request_id: request.id, payload_hash: finalHash, edited: edited !== null, level },
    });
    return { request: updated, action: approved, approved: true };
  });

  if ('lapsed' in outcome) throw conflict('This request has expired. Nothing was approved.');
  if ('changed' in outcome) throw conflict('The payload changed after the request was raised, so the request is void. Ask for it again.');
  return outcome;
}
