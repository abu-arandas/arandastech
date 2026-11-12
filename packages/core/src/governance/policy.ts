import type { Db } from '../lib/db';
import type { Actor, Level } from '../lib/types';
import { type ActionSpec, actionSpec, levelOf } from './actions';
import { matchRule, type StandingRule } from './rules';

/** A check that a domain adds to an action. Each string it returns is a reason to block the action. */
export type Guard = (db: Db, payload: Record<string, unknown>, requester: Actor) => Promise<string[]>;

export interface ProposalContext {
  requester: Actor;
  /** True when the requester recently read content from outside the company. */
  untrustedInput: boolean;
  now: Date;
}

export interface Decision {
  outcome: 'blocked' | 'auto_approved' | 'pending';
  level: Level;
  reasons: string[];
  rule: StandingRule | null;
  spec: ActionSpec<Record<string, unknown>> | null;
  payload: Record<string, unknown>;
}

/**
 * Classifies a proposed action (blueprint 2.2 and 2.3). This is ordinary code: nothing an agent writes, and nothing
 * an agent has read, can change the level of an action or approve it.
 */
export async function evaluate(db: Db, type: string, rawPayload: unknown, ctx: ProposalContext, guards: Guard[]): Promise<Decision> {
  const spec = actionSpec(type);
  const fallback = (rawPayload && typeof rawPayload === 'object' ? rawPayload : {}) as Record<string, unknown>;
  if (!spec) return { outcome: 'blocked', level: 3, reasons: ['unknown_action'], rule: null, spec: null, payload: fallback };

  const parsed = spec.schema.safeParse(rawPayload);
  if (!parsed.success) {
    const where = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`).join('; ');
    return { outcome: 'blocked', level: 3, reasons: [`invalid_payload: ${where}`], rule: null, spec, payload: fallback };
  }
  const payload = parsed.data;
  const level = levelOf(spec, payload);

  const blocked: string[] = [];
  for (const guard of guards) blocked.push(...(await guard(db, payload, ctx.requester)));
  if (blocked.length) return { outcome: 'blocked', level, reasons: blocked, rule: null, spec, payload };

  if (level <= 1) return { outcome: 'auto_approved', level, reasons: [`level_${level}`], rule: null, spec, payload };

  // A run that has read outside content can read and draft only. Anything more goes to the owner (blueprint 10.2).
  if (ctx.untrustedInput) return { outcome: 'pending', level, reasons: ['needs_owner', 'untrusted_input'], rule: null, spec, payload };

  const cost = spec.cost?.(payload) ?? null;
  const rule = await matchRule(db, { type, payload, costMinor: cost?.amount ?? 0, currency: cost?.currency ?? null }, ctx.now);
  if (rule) return { outcome: 'auto_approved', level, reasons: ['standing_rule'], rule, spec, payload };

  return { outcome: 'pending', level, reasons: ['needs_owner'], rule: null, spec, payload };
}
