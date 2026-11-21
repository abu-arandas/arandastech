import { createRule, listRules, revokeRule, type StandingRule } from '../governance/rules';
import { getPolicy } from '../governance/settings';
import type { Db } from '../lib/db';
import type { Platform } from '../platform';
import type { staffOf } from './guards';

/**
 * A department's autopilot: one standing rule that lets it carry out its own approved templates without asking each
 * time (Sales' emails, Marketing's posts). Turning it on replaces the rule, so the new one covers every template of
 * today's code and runs for the full lifetime the policy sheet allows; turning it off revokes it.
 */
export interface Autopilot {
  /** The rule's name, which is how the switch finds it again. */
  name: string;
  actionType: string;
  templates: string[];
  /** How many actions the rule allows in one period. */
  limit: (db: Db) => Promise<number>;
  period: 'day' | 'week';
}

export async function activeAutopilot(db: Db, autopilot: Autopilot): Promise<StandingRule | null> {
  return (await listRules(db)).find((rule) => rule.name === autopilot.name && rule.status === 'active') ?? null;
}

export async function switchAutopilot(
  platform: Platform,
  staff: ReturnType<typeof staffOf>,
  autopilot: Autopilot,
  on: boolean,
): Promise<StandingRule | null> {
  const { db, clock } = platform;
  return db.tx(async (tx) => {
    // One switch at a time per autopilot, so two quick taps cannot leave two rules running.
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`autopilot:${autopilot.name}`]);
    for (const rule of await listRules(tx))
      if (rule.name === autopilot.name && rule.status === 'active')
        await revokeRule(tx, rule.id, staff.actor, staff.isOwner);
    if (!on) return null;
    const now = clock();
    const days = await getPolicy(tx, 'rules.max_lifetime_days');
    return createRule(
      tx,
      {
        name: autopilot.name,
        actionType: autopilot.actionType,
        conditions: { templates: autopilot.templates },
        spendLimitPerActionMinor: 0,
        spendLimitPerPeriodMinor: 0,
        recipientLimitPerPeriod: await autopilot.limit(tx),
        period: autopilot.period,
        expiresAt: new Date(now.getTime() + days * 86_400_000),
      },
      staff.actor,
      staff.isOwner,
      now,
    );
  });
}
