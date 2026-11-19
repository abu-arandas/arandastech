import { z } from 'zod';
import { listInbox, listLeads } from '../crm/crm';
import { ledgerCurrencies, moneySummary } from '../finance/ledger';
import { ACTION_SPECS } from '../governance/actions';
import { listOpenApprovals } from '../governance/approvals';
import { verifyAuditChain } from '../governance/audit';
import { listPauses, pause, resume, type PauseScope } from '../governance/pause';
import type { Platform } from '../platform';
import { check, staffOf } from './guards';
import type { Router } from './http';

const SCOPES = [
  'global',
  'connector',
  'department',
  'product',
  'supplier',
  'orders',
  'advertising',
  'fulfillment',
  'rule',
] as const;
const pauseBody = z.strictObject({
  scope: z.enum(SCOPES),
  target: z.string().max(100).optional(),
  reason: z.string().max(300).optional(),
});

/** The owner app's own reads and actions: the overview, approvals, actions, the audit log, the business, pauses and connectors. */
export function registerOwnerRoutes(router: Router, platform: Platform): void {
  const { db, store, gateway, clock } = platform;

  /** The money summary for every currency the books hold, USD and JOD always first. */
  const moneyByCurrency = async (now: Date) => {
    const currencies = [...new Set(['USD', 'JOD', ...(await ledgerCurrencies(db))])];
    return Promise.all(currencies.map((currency) => moneySummary(db, currency, now)));
  };

  router.add('GET', '/api/owner/overview', 'staff', async ({ caller }) => {
    staffOf(caller);
    const now = clock();
    const open = await listOpenApprovals(db, now);
    const one = async <T>(sql: string): Promise<T> => (await db.query<T>(sql))[0] as T;
    const pauses = (await listPauses(db)).filter((p) => p.paused);
    const { mode, reason, model } = await platform.agents.mode();
    return {
      as_of: now.toISOString(),
      demo: platform.config.demo,
      paused: pauses.some((p) => p.scope === 'global'),
      pauses,
      approvals: {
        open: open.length,
        level_3: open.filter((r) => r.level === 3).length,
        next_expiry: open.map((r) => r.expires_at).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      },
      held_actions: (
        await one<{ n: number }>(
          `select count(*)::int as n from actions where status in ('approved', 'auto_approved') and held_reason is not null`,
        )
      ).n,
      leads: await one(`select count(*) filter (where stage = 'new')::int as new, count(*)::int as total from leads`),
      orders: await one(
        `select count(*)::int as total, count(*) filter (where status = 'on_hold')::int as on_hold, count(*) filter (where status in ('paid', 'fulfilling', 'shipped'))::int as in_progress from orders`,
      ),
      inbox: await one(
        `select count(*) filter (where not handled)::int as unhandled, count(*) filter (where flagged and not handled)::int as flagged from messages where direction = 'in'`,
      ),
      alerts: await one(`select count(*)::int as open from security_alerts where status = 'open'`),
      agents: { mode, reason, model },
      money: await moneyByCurrency(now),
    };
  });

  router.add('GET', '/api/owner/approvals', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { approvals: await listOpenApprovals(db, clock()) };
  });

  router.add('POST', '/api/owner/approvals/:id/decide', 'owner', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    const body = check(
      z.strictObject({
        decision: z.enum(['approve', 'reject', 'postpone']),
        edited_payload: z.record(z.string(), z.unknown()).optional(),
        confirmation: z.strictObject({ amount_minor: z.number().int(), recipient: z.string() }).optional(),
        note: z.string().max(500).optional(),
        postpone_hours: z.number().positive().max(168).optional(),
      }),
      json,
    );
    const { action, request } = await gateway.decide(params.id!, {
      decision: body.decision,
      by: staff.actor,
      isOwner: staff.isOwner,
      editedPayload: body.edited_payload,
      confirmation: body.confirmation,
      note: body.note,
      postponeHours: body.postpone_hours,
    });
    return { action, request };
  });

  router.add('GET', '/api/owner/actions', 'staff', async ({ caller, request }) => {
    staffOf(caller);
    return {
      actions: await db.query(
        `select * from actions where ($1::text is null or status = $1) order by created_at desc limit 200`,
        [request.query.status ?? null],
      ),
    };
  });

  router.add('POST', '/api/owner/actions', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const body = check(z.strictObject({ type: z.string(), payload: z.record(z.string(), z.unknown()) }), json);
    return gateway.propose({ type: body.type, payload: body.payload, requester: staff.actor });
  });

  router.add('GET', '/api/owner/action-types', 'staff', async ({ caller }) => {
    staffOf(caller);
    return {
      action_types: ACTION_SPECS.map((spec) => ({
        type: spec.type,
        connector: spec.connector,
        level: typeof spec.level === 'function' ? 'depends on the payload' : spec.level,
        reversible: spec.reversible,
        risk: spec.risk,
        standing_rule: spec.delegable,
      })),
    };
  });

  router.add('GET', '/api/owner/audit', 'staff', async ({ caller, request }) => {
    staffOf(caller);
    const limit = Math.min(500, Math.max(1, Number(request.query.limit ?? 100) || 100));
    return {
      chain_intact: (await verifyAuditChain(db)) === null,
      events: await db.query(
        `select seq, at, actor_kind, actor_id, event_type, subject_type, subject_id, data, hash from audit_events order by seq desc limit $1`,
        [limit],
      ),
    };
  });

  router.add('GET', '/api/owner/leads', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { leads: await listLeads(db) };
  });

  router.add('GET', '/api/owner/inbox', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { messages: await listInbox(db) };
  });

  router.add('GET', '/api/owner/products', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { products: await store.products() };
  });

  // Publishing is level 2: this only asks, and the owner confirms it in Approvals, where the margin checks show.
  router.add('POST', '/api/owner/products/:id/publish', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    return gateway.propose({
      type: 'store.publish_product',
      payload: { product_id: params.id! },
      requester: staff.actor,
    });
  });

  router.add('GET', '/api/owner/orders', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { orders: await store.orders() };
  });

  router.add('GET', '/api/owner/orders/:id', 'staff', async ({ caller, params }) => {
    staffOf(caller);
    return { order: await store.order(params.id!) };
  });

  router.add('POST', '/api/owner/orders/:id/release', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    return { order: await store.release(params.id!, staff.actor, staff.isOwner) };
  });

  router.add('POST', '/api/owner/orders/:id/refund', 'staff', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    const body = check(
      z.strictObject({ amount_minor: z.number().int().positive().optional(), reason: z.string().min(3).max(500) }),
      json,
    );
    // Proposing a refund is preparation. It still waits in the inbox for the owner's confirmed approval.
    return store.proposeRefund(params.id!, { amountMinor: body.amount_minor, reason: body.reason }, staff.actor);
  });

  router.add('GET', '/api/owner/finance', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { summaries: await moneyByCurrency(clock()) };
  });

  router.add('GET', '/api/owner/pauses', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { pauses: await listPauses(db) };
  });

  router.add('POST', '/api/owner/pause', 'staff', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const body = check(pauseBody, json);
    await pause(db, { scope: body.scope as PauseScope, target: body.target }, body.reason ?? '', staff.actor);
    return { paused: true };
  });

  router.add('POST', '/api/owner/resume', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const body = check(pauseBody, json);
    await resume(db, { scope: body.scope as PauseScope, target: body.target }, staff.actor, staff.isOwner);
    const released = await gateway.releaseHeld();
    return { paused: false, released: released.map((action) => ({ id: action.id, status: action.status })) };
  });

  router.add('GET', '/api/owner/connectors', 'staff', async ({ caller }) => {
    staffOf(caller);
    return {
      connectors: await db.query(
        'select id, name, mode, status, status_note, last_ok_at, last_error from connectors order by name',
      ),
    };
  });
}
