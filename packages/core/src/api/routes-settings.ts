import { z } from 'zod';
import { metrics } from '../finance/metrics';
import { audit } from '../governance/audit';
import { createRule, listRules, revokeRule } from '../governance/rules';
import { listPolicy, type PolicyKey, POLICY_DEFAULTS, setPolicy } from '../governance/settings';
import { AppError, invalid } from '../lib/errors';
import { approveMemory } from '../memory';
import type { Platform } from '../platform';
import { check, staffOf } from './guards';
import type { Router } from './http';

/** What the owner sends to create a standing rule (blueprint 2.5). */
const ruleBody = z.strictObject({
  name: z.string().min(1).max(100),
  action_type: z.string(),
  conditions: z
    .strictObject({
      template: z.string().optional(),
      templates: z.array(z.string().max(80)).max(30).optional(),
      recipient: z.literal('order_buyer').optional(),
    })
    .default({}),
  spend_limit_per_action_minor: z.number().int().nonnegative(),
  spend_limit_per_period_minor: z.number().int().nonnegative(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  recipient_limit_per_period: z.number().int().positive(),
  period: z.enum(['day', 'week', 'month']),
  expires_at: z.iso.datetime(),
  max_failures: z.number().int().positive().max(20).optional(),
});

/** Standing rules, policy settings, security alerts, metrics and business memory. */
export function registerSettingsRoutes(router: Router, platform: Platform): void {
  const { db, clock } = platform;

  router.add('GET', '/api/owner/rules', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { rules: await listRules(db) };
  });

  router.add('POST', '/api/owner/rules', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const body = check(ruleBody, json);
    const rule = await createRule(
      db,
      {
        name: body.name,
        actionType: body.action_type,
        conditions: body.conditions,
        spendLimitPerActionMinor: body.spend_limit_per_action_minor,
        spendLimitPerPeriodMinor: body.spend_limit_per_period_minor,
        currency: body.currency,
        recipientLimitPerPeriod: body.recipient_limit_per_period,
        period: body.period,
        expiresAt: new Date(body.expires_at),
        maxFailures: body.max_failures,
      },
      staff.actor,
      staff.isOwner,
      clock(),
    );
    return { rule };
  });

  router.add('POST', '/api/owner/rules/:id/revoke', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    await revokeRule(db, params.id!, staff.actor, staff.isOwner);
    return { revoked: true };
  });

  router.add('GET', '/api/owner/policy', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { settings: await listPolicy(db) };
  });

  router.add('PUT', '/api/owner/policy/:key', 'owner', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    if (!Object.hasOwn(POLICY_DEFAULTS, params.key!)) throw invalid(`unknown policy setting ${params.key}`);
    await setPolicy(db, params.key as PolicyKey, json.value as never, staff.actor);
    return { key: params.key, value: json.value };
  });

  router.add('GET', '/api/owner/alerts', 'staff', async ({ caller }) => {
    staffOf(caller);
    return {
      alerts: await db.query(
        `select * from security_alerts order by (status = 'open') desc, created_at desc limit 100`,
      ),
    };
  });

  router.add('POST', '/api/owner/alerts/:id/resolve', 'staff', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    const id = check(z.uuid(), params.id);
    const body = check(z.strictObject({ status: z.enum(['acknowledged', 'resolved']).default('resolved') }), json);
    return db.tx(async (tx) => {
      const rows = await tx.query(
        `update security_alerts set status = $2, resolved_at = case when $2 = 'resolved' then now() else null end
         where id = $1 and status <> 'resolved' returning id, status`,
        [id, body.status],
      );
      if (!rows[0]) throw new AppError('not_found', 'There is no open alert with this id.', 404);
      await audit(tx, {
        actor: staff.actor,
        type: `alert.${body.status}`,
        subject: { type: 'security_alert', id },
        data: {},
      });
      return { alert: rows[0] };
    });
  });

  // The numbers of blueprint 18, counted from the records at the moment of the request.
  router.add('GET', '/api/owner/metrics', 'staff', async ({ caller, request }) => {
    staffOf(caller);
    const days = Number(request.query.days ?? 30);
    return { metrics: await metrics(db, clock(), Number.isInteger(days) && days > 0 && days <= 365 ? days : 30) };
  });

  router.add('GET', '/api/owner/memory', 'staff', async ({ caller }) => {
    staffOf(caller);
    return {
      items: await db.query(
        `select key, kind, title, body, source, owner, status, sensitivity, version, review_at from memory_items order by kind, key`,
      ),
    };
  });

  router.add('POST', '/api/owner/memory/:key/approve', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    return { item: await approveMemory(db, params.key!, staff.actor, staff.isOwner) };
  });
}
