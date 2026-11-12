import { type Db, json, maybeOne, one } from '../lib/db';
import { forbidden, invalid, notFound } from '../lib/errors';
import type { Actor } from '../lib/types';
import { actionSpec, levelOf } from './actions';
import { audit } from './audit';
import { getPolicy } from './settings';

/** The conditions a standing rule can put on an action. Every one that is present must hold. */
export interface RuleConditions {
  /** The message must use this approved template. */
  template?: string;
  /** The recipient must be the buyer of the order the action names. */
  recipient?: 'order_buyer';
}

export interface NewRule {
  name: string;
  actionType: string;
  conditions: RuleConditions;
  /** The most one action may spend. Zero is a valid limit. */
  spendLimitPerActionMinor: number;
  spendLimitPerPeriodMinor: number;
  currency?: string;
  /** How many actions may run under the rule in one period. */
  recipientLimitPerPeriod: number;
  period: 'day' | 'week' | 'month';
  expiresAt: Date;
  maxFailures?: number;
}

export interface StandingRule {
  id: string;
  name: string;
  action_type: string;
  connector: string;
  conditions: RuleConditions;
  spend_limit_per_action_minor: number;
  spend_limit_per_period_minor: number;
  currency: string | null;
  recipient_limit_per_period: number;
  period: 'day' | 'week' | 'month';
  expires_at: Date;
  max_failures: number;
  status: 'active' | 'suspended' | 'expired' | 'revoked';
  suspended_reason: string | null;
}

/** Only the owner creates a standing rule, and every element of blueprint 2.5 is required. */
export async function createRule(db: Db, rule: NewRule, owner: Actor, isOwner: boolean, now: Date): Promise<StandingRule> {
  if (!isOwner || owner.kind !== 'person' || !owner.id) throw forbidden('Only the owner can create a standing rule.');
  const spec = actionSpec(rule.actionType);
  if (!spec) throw invalid(`unknown action ${rule.actionType}`);
  if (spec.delegable === 'never') throw forbidden(`${rule.actionType} can never run under a standing rule.`);
  if (spec.delegable === 'not_needed') throw invalid(`${rule.actionType} already runs without approval.`);
  const level = typeof spec.level === 'function' ? 2 : spec.level;
  if ((spec.delegable === 'later' || level === 3) && !(await getPolicy(db, 'rules.allow_level_3'))) {
    throw forbidden(`${rule.actionType} needs the owner's approval every time during the early stages.`);
  }
  if (!rule.name.trim()) throw invalid('a rule needs a name');
  if (rule.spendLimitPerActionMinor < 0 || rule.spendLimitPerPeriodMinor < 0) throw invalid('spending limits cannot be negative');
  if (!Number.isInteger(rule.recipientLimitPerPeriod) || rule.recipientLimitPerPeriod < 1) throw invalid('a rule needs a recipient limit of at least one');
  const maxDays = await getPolicy(db, 'rules.max_lifetime_days');
  const latest = new Date(now.getTime() + maxDays * 86_400_000);
  if (rule.expiresAt <= now) throw invalid('the expiry date is in the past');
  if (rule.expiresAt > latest) throw invalid(`a rule can run for at most ${maxDays} days before renewal`);

  return db.tx(async (tx) => {
    const created = one(
      await tx.query<StandingRule>(
        `insert into standing_rules (name, action_type, connector, conditions, spend_limit_per_action_minor,
           spend_limit_per_period_minor, currency, recipient_limit_per_period, period, expires_at, max_failures, created_by)
         values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
        [rule.name.trim(), rule.actionType, spec.connector, json(rule.conditions), rule.spendLimitPerActionMinor,
          rule.spendLimitPerPeriodMinor, rule.currency ?? null, rule.recipientLimitPerPeriod, rule.period, rule.expiresAt,
          rule.maxFailures ?? 3, owner.id],
      ),
    );
    await audit(tx, { actor: owner, type: 'rule.created', subject: { type: 'standing_rule', id: created.id }, data: { name: created.name, action_type: created.action_type, expires_at: created.expires_at.toISOString() } });
    return created;
  });
}

const PERIOD_START: Record<StandingRule['period'], string> = { day: 'day', week: 'week', month: 'month' };

/** The active rule that covers this action, or null. A rule that has reached a limit does not match. */
export async function matchRule(
  db: Db,
  action: { type: string; payload: Record<string, unknown>; costMinor: number; currency: string | null },
  now: Date,
): Promise<StandingRule | null> {
  const spec = actionSpec(action.type);
  if (!spec || spec.delegable === 'never' || spec.delegable === 'not_needed') return null;
  if (levelOf(spec, action.payload) === 3 && !(await getPolicy(db, 'rules.allow_level_3'))) return null;
  const rules = await db.query<StandingRule>(
    `select * from standing_rules where action_type = $1 and status = 'active' and expires_at > $2 order by created_at`,
    [action.type, now],
  );
  for (const rule of rules) {
    if (rule.conditions.template && rule.conditions.template !== action.payload.template) continue;
    if (rule.conditions.recipient === 'order_buyer') {
      const order = maybeOne(await db.query<{ buyer_email: string }>('select buyer_email from orders where id = $1', [action.payload.order_id ?? null]));
      if (!order || order.buyer_email.toLowerCase() !== String(action.payload.to ?? '').toLowerCase()) continue;
    }
    if (action.costMinor > rule.spend_limit_per_action_minor) continue;
    if (action.costMinor > 0 && rule.currency !== action.currency) continue;
    const used = one(
      await db.query<{ spent: number; uses: number }>(
        `select coalesce(sum(spend_minor), 0)::bigint as spent, count(*)::int as uses from standing_rule_uses
         where rule_id = $1 and at >= date_trunc('${PERIOD_START[rule.period]}', $2::timestamptz)`,
        [rule.id, now],
      ),
    );
    if (used.uses >= rule.recipient_limit_per_period) continue;
    if (used.spent + action.costMinor > rule.spend_limit_per_period_minor) continue;
    return rule;
  }
  return null;
}

export async function recordRuleUse(db: Db, ruleId: string, actionId: string, spendMinor: number, recipient: string | null, at: Date): Promise<void> {
  await db.query('insert into standing_rule_uses (rule_id, action_id, spend_minor, recipient, at) values ($1, $2, $3, $4, $5)', [ruleId, actionId, spendMinor, recipient, at]);
}

export async function suspendRule(db: Db, ruleId: string, reason: string, by: Actor): Promise<void> {
  const rows = await db.query(`update standing_rules set status = 'suspended', suspended_reason = $2 where id = $1 and status = 'active' returning id`, [ruleId, reason]);
  if (rows.length) await audit(db, { actor: by, type: 'rule.suspended', subject: { type: 'standing_rule', id: ruleId }, data: { reason } });
}

/** A rule suspends itself when its actions keep failing (blueprint 2.5). */
export async function noteRuleFailure(db: Db, ruleId: string, by: Actor): Promise<void> {
  const rule = maybeOne(await db.query<StandingRule>('select * from standing_rules where id = $1', [ruleId]));
  if (!rule || rule.status !== 'active') return;
  const recent = await db.query<{ status: string }>(
    `select status from actions where standing_rule_id = $1 and status in ('executed', 'failed') order by created_at desc limit $2`,
    [ruleId, rule.max_failures],
  );
  if (recent.length >= rule.max_failures && recent.every((a) => a.status === 'failed')) {
    await suspendRule(db, ruleId, `${rule.max_failures} actions in a row failed`, by);
  }
}

export async function revokeRule(db: Db, ruleId: string, owner: Actor, isOwner: boolean): Promise<void> {
  if (!isOwner) throw forbidden('Only the owner can revoke a standing rule.');
  const rows = await db.query(`update standing_rules set status = 'revoked' where id = $1 returning id`, [ruleId]);
  if (!rows.length) throw notFound('standing rule');
  await audit(db, { actor: owner, type: 'rule.revoked', subject: { type: 'standing_rule', id: ruleId } });
}

export async function expireRules(db: Db, now: Date): Promise<number> {
  const rows = await db.query(`update standing_rules set status = 'expired' where status = 'active' and expires_at <= $1 returning id`, [now]);
  return rows.length;
}

export async function listRules(db: Db): Promise<StandingRule[]> {
  return db.query<StandingRule>('select * from standing_rules order by created_at desc');
}
