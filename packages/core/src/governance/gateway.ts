import type { Connector } from '../connectors/types';
import { type Db, json, maybeOne, one } from '../lib/db';
import { conflict, notFound } from '../lib/errors';
import { payloadHash } from '../lib/hash';
import type { Actor, Clock } from '../lib/types';
import { actionSpec } from './actions';
import { type ActionRow, type ApprovalRequestRow, createApprovalRequest, decideApproval, type DecisionInput } from './approvals';
import { audit } from './audit';
import { activePause, type PauseTarget } from './pause';
import { evaluate, type Guard } from './policy';
import { noteRuleFailure, recordRuleUse } from './rules';
import { getPolicy } from './settings';

/** Runs in the platform itself for actions on the `platform` connector, such as publishing a product. */
export type InternalHandler = (db: Db, payload: Record<string, unknown>, action: ActionRow) => Promise<Record<string, unknown>>;
/** Runs after an action has executed, to record what it changed: a ledger posting, an order status. */
export type Effect = (db: Db, action: ActionRow, result: Record<string, unknown>) => Promise<void>;

export interface Proposal {
  type: string;
  payload: unknown;
  requester: Actor;
  /** The source content and data the proposal is based on, shown to the owner. */
  evidence?: unknown[];
  /** A repeated proposal with the same key finds the same action and changes nothing. */
  idempotencyKey?: string;
  taskId?: string;
  agentRunId?: string;
  /** Set when the caller knows the proposal was prompted by outside content. */
  untrustedInput?: boolean;
}

export interface ProposalResult {
  action: ActionRow;
  request: ApprovalRequestRow | null;
  /** True when this call found an action that already existed under the same idempotency key. */
  duplicate: boolean;
}

const MAX_ATTEMPTS = 3;

/**
 * The only way out of the platform (blueprint 11.1). Every action is classified by the policy engine, waits for the
 * owner when it must, respects every pause, carries an idempotency key, and is written to the audit log.
 */
export class Gateway {
  private readonly guards = new Map<string, Guard[]>();
  private readonly effects = new Map<string, Effect[]>();
  private readonly internal = new Map<string, InternalHandler>();

  constructor(
    private readonly db: Db,
    private readonly connectors: Record<string, Connector>,
    private readonly clock: Clock,
  ) {}

  guard(type: string, guard: Guard): void {
    this.guards.set(type, [...(this.guards.get(type) ?? []), guard]);
  }

  onExecuted(type: string, effect: Effect): void {
    this.effects.set(type, [...(this.effects.get(type) ?? []), effect]);
  }

  handle(type: string, handler: InternalHandler): void {
    this.internal.set(type, handler);
  }

  guardsFor = (type: string): Guard[] => this.guards.get(type) ?? [];

  async propose(proposal: Proposal): Promise<ProposalResult> {
    const now = this.clock();
    const untrusted = proposal.untrustedInput === true || (proposal.requester.kind === 'agent' && (await this.readOutsideContentRecently(proposal.requester.id, now)));
    const decision = await evaluate(this.db, proposal.type, proposal.payload, { requester: proposal.requester, untrustedInput: untrusted, now }, this.guardsFor(proposal.type));
    const hash = payloadHash(decision.payload);
    // Without an explicit key, the same action proposed twice on one day is one action (duplicate-action detection).
    const key = proposal.idempotencyKey ?? `${proposal.type}:${hash}:${now.toISOString().slice(0, 10)}`;

    const existing = maybeOne(await this.db.query<ActionRow>('select * from actions where idempotency_key = $1', [key]));
    if (existing) {
      const request = maybeOne(await this.db.query<ApprovalRequestRow>('select * from approval_requests where action_id = $1', [existing.id]));
      return { action: existing, request, duplicate: true };
    }

    const spec = decision.spec;
    const cost = spec?.cost?.(decision.payload) ?? null;
    const recipient = spec?.recipient?.(decision.payload) ?? null;
    const created = await this.db.tx(async (tx) => {
      const action = one(
        await tx.query<ActionRow>(
          `insert into actions (action_type, connector, level, status, payload, payload_hash, summary, recipient, cost_minor, currency,
             reversible, risk, expected_result, evidence, reasons, requested_by_kind, requested_by_id, agent_run_id, task_id,
             standing_rule_id, idempotency_key, untrusted_input, decided_at, created_at)
           values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17, $18, $19, $20, $21, $22, $23, $24)
           returning *`,
          [proposal.type, spec?.connector ?? 'platform', decision.level, decision.outcome, json(decision.payload), hash,
            spec ? spec.summarize(decision.payload) : `Unknown action ${proposal.type}`, recipient, cost?.amount ?? 0, cost?.currency ?? null,
            spec?.reversible ?? false, spec?.risk ?? '', spec ? spec.expected(decision.payload) : '', json(proposal.evidence ?? []),
            json(decision.reasons), proposal.requester.kind, proposal.requester.id, proposal.agentRunId ?? null, proposal.taskId ?? null,
            decision.rule?.id ?? null, key, untrusted, decision.outcome === 'pending' ? null : now, now],
        ),
      );
      let request: ApprovalRequestRow | null = null;
      if (decision.outcome === 'pending') request = await createApprovalRequest(tx, action, now);
      if (decision.rule) await recordRuleUse(tx, decision.rule.id, action.id, action.cost_minor, action.recipient, now);
      await audit(tx, {
        actor: proposal.requester,
        type: `action.${decision.outcome}`,
        subject: { type: 'action', id: action.id },
        data: { action_type: action.action_type, level: action.level, payload_hash: hash, reasons: decision.reasons, rule_id: decision.rule?.id ?? null, request_id: request?.id ?? null },
      });
      return { action, request };
    });

    if (created.action.status === 'auto_approved') {
      const action = await this.execute(created.action.id);
      return { action, request: null, duplicate: false };
    }
    return { ...created, duplicate: false };
  }

  /** The owner's decision. An approved action runs at once, unless a pause holds it. */
  async decide(requestId: string, input: DecisionInput): Promise<{ action: ActionRow; request: ApprovalRequestRow }> {
    const result = await decideApproval(this.db, requestId, input, this.clock(), this.guardsFor);
    if (!result.approved) return { action: result.action, request: result.request };
    return { action: await this.execute(result.action.id), request: result.request };
  }

  async execute(actionId: string): Promise<ActionRow> {
    // Phase 1: check that the action may run now, and claim it.
    const claimed = await this.db.tx(async (tx): Promise<{ action: ActionRow; run: boolean }> => {
      const action = maybeOne(await tx.query<ActionRow>('select * from actions where id = $1 for update', [actionId]));
      if (!action) throw notFound('action');
      if (!['auto_approved', 'approved', 'failed'].includes(action.status)) throw conflict(`an action in status ${action.status} cannot run`);
      if (action.status === 'failed' && action.attempts >= MAX_ATTEMPTS) throw conflict('this action has failed too many times');
      if (payloadHash(action.payload) !== action.payload_hash) throw conflict('the payload does not match its hash');
      const spec = actionSpec(action.action_type);
      if (!spec) throw conflict(`unknown action type ${action.action_type}`);
      if (action.level >= 2 && !action.standing_rule_id) {
        const request = maybeOne(await tx.query<ApprovalRequestRow>('select * from approval_requests where action_id = $1', [action.id]));
        if (!request || request.status !== 'approved' || request.payload_hash !== action.payload_hash) throw conflict('this action has no approval for its current payload');
      }

      const targets: PauseTarget[] = [{ scope: 'connector', target: action.connector }, ...(spec.pauseScopes?.(action.payload) ?? [])];
      if (action.requested_by_kind === 'agent' && action.requested_by_id) targets.push({ scope: 'department', target: action.requested_by_id });
      if (action.standing_rule_id) targets.push({ scope: 'rule', target: action.standing_rule_id });
      const paused = await activePause(tx, targets);
      if (paused) {
        const reason = `paused: ${paused.scope}${paused.target === '*' ? '' : ` ${paused.target}`}`;
        if (action.held_reason !== reason) {
          await tx.query('update actions set held_reason = $2 where id = $1', [action.id, reason]);
          await audit(tx, { actor: { kind: 'system', id: null }, type: 'action.held', subject: { type: 'action', id: action.id }, data: { reason } });
        }
        return { action: { ...action, held_reason: reason }, run: false };
      }
      const executing = one(await tx.query<ActionRow>(`update actions set status = 'executing', held_reason = null, attempts = attempts + 1, error = null where id = $1 returning *`, [action.id]));
      return { action: executing, run: true };
    });
    if (!claimed.run) return claimed.action;
    const action = claimed.action;

    // Phase 2: the call itself, outside any transaction. The idempotency key makes a retry safe.
    let result: Record<string, unknown>;
    try {
      const handler = this.internal.get(action.action_type);
      if (action.connector === 'platform') {
        if (!handler) throw new Error(`no handler for ${action.action_type}`);
        result = await this.db.tx((tx) => handler(tx, action.payload, action));
      } else {
        const connector = this.connectors[action.connector];
        if (!connector) throw new Error(`connector ${action.connector} is not available`);
        result = await connector.execute(action.action_type, action.payload, { db: this.db, idempotencyKey: action.idempotency_key });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.db.tx(async (tx) => {
        const failed = one(await tx.query<ActionRow>(`update actions set status = 'failed', error = $2 where id = $1 returning *`, [action.id, message]));
        await tx.query(`update connectors set last_error = $2 where id = $1`, [action.connector, message]);
        await audit(tx, { actor: { kind: 'system', id: null }, type: 'action.failed', subject: { type: 'action', id: action.id }, data: { error: message, attempt: failed.attempts } });
        if (failed.standing_rule_id) await noteRuleFailure(tx, failed.standing_rule_id, { kind: 'system', id: null });
        return failed;
      });
    }

    // Phase 3: record the result, then what it changed.
    const executed = await this.db.tx(async (tx) => {
      const done = one(await tx.query<ActionRow>(`update actions set status = 'executed', result = $2::jsonb, executed_at = $3 where id = $1 returning *`, [action.id, json(result), this.clock()]));
      await tx.query(`update connectors set last_ok_at = now(), last_error = null where id = $1`, [action.connector]);
      await audit(tx, { actor: { kind: 'system', id: null }, type: 'action.executed', subject: { type: 'action', id: action.id }, data: { action_type: action.action_type, payload_hash: action.payload_hash, result } });
      return done;
    });
    for (const effect of this.effects.get(action.action_type) ?? []) {
      try {
        await this.db.tx((tx) => effect(tx, executed, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.db.tx(async (tx) => {
          await tx.query(`insert into security_alerts (severity, kind, summary, detail) values ('critical', 'effect_failed', $1, $2::jsonb)`, [
            `${action.action_type} ran, but recording its result failed. Reconcile it by hand.`,
            json({ action_id: action.id, error: message }),
          ]);
          await audit(tx, { actor: { kind: 'system', id: null }, type: 'action.effect_failed', subject: { type: 'action', id: action.id }, data: { error: message } });
        });
      }
    }
    return executed;
  }

  /** Runs the actions a pause was holding. Called after the owner ends a pause. Held actions are kept, not dropped. */
  async releaseHeld(): Promise<ActionRow[]> {
    const held = await this.db.query<{ id: string }>(`select id from actions where status in ('auto_approved', 'approved') and held_reason is not null order by created_at`);
    const out: ActionRow[] = [];
    for (const { id } of held) out.push(await this.execute(id));
    return out;
  }

  /** Records that an agent has just read content from outside the company. */
  async noteOutsideContentRead(agentId: string, what: string): Promise<void> {
    await this.db.query(
      `insert into agent_runs (agent_id, workflow, trigger_kind, trigger_ref, status, untrusted_input, started_at, finished_at)
       values ($1, 'read_outside_content', 'event', $2, 'succeeded', true, $3, $3)`,
      [agentId, what, this.clock()],
    );
  }

  private async readOutsideContentRecently(agentId: string | null, now: Date): Promise<boolean> {
    if (!agentId) return false;
    const minutes = await getPolicy(this.db, 'security.untrusted_window_minutes');
    const rows = await this.db.query(
      `select 1 from agent_runs where agent_id = $1 and untrusted_input and started_at > $2 limit 1`,
      [agentId, new Date(now.getTime() - minutes * 60_000)],
    );
    return rows.length > 0;
  }
}
