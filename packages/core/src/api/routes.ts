import { z } from 'zod';
import { getCommand, listCommands, planCommand, startCommand } from '../agents/command';
import { listJobs } from '../agents/jobs';
import { signedEvent } from '../commerce/store';
import { listMockDeliveries } from '../connectors/mock';
import {
  check as checkConnection,
  disconnect,
  listConnections,
  livePayments,
  paytabsCallback,
  saveConnection,
  startGoogleSignIn,
  syncGmail,
  whatsappWebhook,
} from '../connectors/registry';
import { createLead, listInbox, listLeads, recordInbound } from '../crm/crm';
import { ledgerCurrencies, moneySummary } from '../finance/ledger';
import { metrics } from '../finance/metrics';
import { ACTION_SPECS } from '../governance/actions';
import { listOpenApprovals } from '../governance/approvals';
import { audit, verifyAuditChain } from '../governance/audit';
import { listPauses, pause, resume, type PauseScope } from '../governance/pause';
import { createRule, listRules, revokeRule } from '../governance/rules';
import { listPolicy, type PolicyKey, POLICY_DEFAULTS, setPolicy } from '../governance/settings';
import { AppError, forbidden, invalid } from '../lib/errors';
import { approveMemory } from '../memory';
import type { Platform } from '../platform';
import type { Caller, RouteContext, Router } from './http';

const staffOf = (caller: Caller) => {
  if (caller.kind !== 'staff') throw forbidden('This is for the team only.');
  return caller;
};

const check = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw invalid(
      'The request is not complete.',
      parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    );
  return parsed.data;
};

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

export function registerRoutes(router: Router, platform: Platform): void {
  const { db, store, gateway, clock } = platform;

  // ---------------------------------------------------------------- Public: the website and the storefront

  router.add('GET', '/api/public/catalog', 'public', async () => ({ products: await store.catalog() }));

  router.add('GET', '/api/public/packages', 'public', async () => ({
    packages: await db.query(
      `select id, name, outcome, audience, deliverables, price_kind from service_packages where status = 'approved' order by sort`,
    ),
  }));

  router.add('POST', '/api/public/leads', 'public', async ({ json }) => {
    // A field people cannot see. Only a script fills it in, and a script gets a polite nothing.
    if (typeof json.website === 'string' && json.website.trim() !== '') return { received: true };
    const { website: _ignored, ...form } = json;
    const recent = await db.query(`select 1 from leads where lower(email) = lower($1) and created_at > $2`, [
      String(form.email ?? ''),
      new Date(clock().getTime() - 3_600_000),
    ]);
    if (recent.length >= 5) throw new AppError('too_many', 'We have your messages. We will reply soon.', 429);
    const { lead, duplicate } = await createLead(db, form as never, clock());
    return { received: true, duplicate, reference: lead.id.slice(0, 8) };
  });

  router.add('POST', '/api/public/checkout', 'public', async ({ json }) => {
    // In live mode an order needs a way to pay. Until PayTabs is connected, nobody is left with an order they cannot pay.
    if (!platform.config.demo && !livePayments(platform))
      throw new AppError('payments_closed', 'Card payments are not open yet.', 503);
    const { order, session, duplicate } = await store.createCheckout(json as never);
    return { order_number: order.number, total_minor: order.total_minor, currency: order.currency, session, duplicate };
  });

  router.add('GET', '/api/public/payments', 'public', async () => ({
    provider: livePayments(platform) ? 'paytabs' : platform.config.demo ? 'test' : 'none',
  }));

  // Where the buyer pays: PayTabs' own card page when PayTabs is connected, the test page in demo mode otherwise.
  router.add('POST', '/api/public/pay', 'public', async ({ json }) => {
    const body = check(z.strictObject({ session: z.string().min(1).max(80), locale: z.enum(['en', 'ar']) }), json);
    const order = (
      await db.query<{
        number: string;
        total_minor: number;
        currency: string;
        buyer_name: string;
        buyer_email: string;
        status: string;
      }>(
        'select number, total_minor, currency, buyer_name, buyer_email, status from orders where checkout_session = $1',
        [body.session],
      )
    )[0];
    if (!order) throw new AppError('not_found', 'No checkout matches that session.', 404);
    if (order.status !== 'pending_payment') return { provider: 'none', order_number: order.number, paid: true };
    const paytabs = livePayments(platform);
    if (!paytabs) return { provider: platform.config.demo ? 'test' : 'none', order_number: order.number, paid: false };
    const site = platform.config.siteUrl ?? 'http://localhost:3000';
    const page = await paytabs.paymentPage({
      session: body.session,
      amountMinor: order.total_minor,
      currency: order.currency,
      description: `Zirr order ${order.number}`,
      buyer: { name: order.buyer_name, email: order.buyer_email },
      callback: `${site}/api/webhooks/paytabs`,
      returnUrl: `${site}/${body.locale}/order?number=${encodeURIComponent(order.number)}&paying=1`,
      locale: body.locale,
    });
    return { provider: 'paytabs', order_number: order.number, paid: false, url: page.url };
  });

  router.add('GET', '/api/public/orders/:number', 'public', async ({ params, request }) => {
    const status = await store.publicStatus(params.number!, request.query.email ?? '');
    if (!status) throw new AppError('not_found', 'No order matches that number and email address.', 404);
    return status;
  });

  router.add('POST', '/api/webhooks/payments', 'public', async ({ request }) =>
    store.handlePaymentWebhook(request.body, request.headers['x-signature']),
  );
  router.add('POST', '/api/webhooks/paytabs', 'public', async ({ request }) =>
    paytabsCallback(platform, request.body, request.headers.signature),
  );
  router.add('POST', '/api/webhooks/whatsapp', 'public', async ({ request }) =>
    whatsappWebhook(platform, request.body, request.headers['x-hub-signature-256']),
  );
  router.add('POST', '/api/webhooks/supplier', 'public', async ({ request }) =>
    store.handleSupplierWebhook(request.body, request.headers['x-signature']),
  );

  // ---------------------------------------------------------------- Demo mode only: stand-ins for the outside world

  const secrets = platform.config.webhookSecrets;

  router.add('POST', '/api/demo/pay', 'demo', async ({ json }) => {
    // Once real cards are taken, nothing may mark an order paid without the provider saying so.
    if (livePayments(platform)) throw new AppError('payments_live', 'Payments are live. Pay on the card page.', 409);
    const body = check(
      z.strictObject({ session: z.string(), deliveries: z.number().int().min(1).max(3).default(1) }),
      json,
    );
    const order = (
      await db.query<{ number: string; total_minor: number; currency: string }>(
        'select number, total_minor, currency from orders where checkout_session = $1',
        [body.session],
      )
    )[0];
    if (!order) throw new AppError('not_found', 'No checkout matches that session.', 404);
    const event = signedEvent(
      secrets.payments,
      'payment.captured',
      {
        session: body.session,
        payment_ref: `pay_${order.number}`,
        amount_minor: order.total_minor,
        currency: order.currency,
      },
      `evt_capture_${order.number}`,
    );
    const results = [];
    // A real provider often sends the same notice more than once. The demo can do the same.
    for (let i = 0; i < body.deliveries; i += 1)
      results.push(await store.handlePaymentWebhook(event.body, event.signature));
    return { order_number: order.number, payment_ref: `pay_${order.number}`, results };
  });

  router.add('POST', '/api/demo/settle', 'demo_owner', async ({ json }) => {
    const body = check(z.strictObject({ payment_ref: z.string(), fee_minor: z.number().int().nonnegative() }), json);
    const event = signedEvent(secrets.payments, 'payment.settled', body);
    return store.handlePaymentWebhook(event.body, event.signature);
  });

  router.add('POST', '/api/demo/supplier', 'demo_owner', async ({ json }) => {
    const body = check(
      z.strictObject({
        supplier_ref: z.string(),
        status: z.enum(['shipped', 'delivered']),
        tracking: z.string().optional(),
      }),
      json,
    );
    const event = signedEvent(secrets.supplier, 'shipment.updated', body);
    return store.handleSupplierWebhook(event.body, event.signature);
  });

  router.add('POST', '/api/demo/inbound-email', 'demo_owner', async ({ json }) => {
    const body = check(
      z.strictObject({
        from: z.email(),
        subject: z.string().max(200).optional(),
        body: z.string().min(1).max(10_000),
        locale: z.enum(['en', 'ar']).default('en'),
      }),
      json,
    );
    const message = await recordInbound(db, { channel: 'email', ...body });
    return { message_id: message.id, flagged: message.flagged, flag_reasons: message.flag_reasons };
  });

  // What the mock connectors "sent" holds customers' names, addresses and license keys, so only the owner reads it.
  router.add('GET', '/api/demo/deliveries', 'demo_owner', async () => ({ deliveries: await listMockDeliveries(db) }));

  // ---------------------------------------------------------------- The owner app

  router.add('GET', '/api/owner/overview', 'staff', async ({ caller }) => {
    staffOf(caller);
    const now = clock();
    const open = await listOpenApprovals(db, now);
    const one = async <T>(sql: string): Promise<T> => (await db.query<T>(sql))[0] as T;
    const pauses = (await listPauses(db)).filter((p) => p.paused);
    const currencies = [...new Set(['USD', 'JOD', ...(await ledgerCurrencies(db))])];
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
      agents: await (async () => {
        const mode = await platform.agents.mode();
        return { mode: mode.mode, reason: mode.reason, model: mode.model };
      })(),
      money: await Promise.all(currencies.map((currency) => moneySummary(db, currency, now))),
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
    const currencies = [...new Set(['USD', 'JOD', ...(await ledgerCurrencies(db))])];
    return { summaries: await Promise.all(currencies.map((currency) => moneySummary(db, currency, clock()))) };
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

  // ---------------------------------------------------------------- Connections to outside accounts

  const site = (): string => platform.config.siteUrl ?? 'http://localhost:3000';
  const connectionId = z.enum(['gmail', 'github', 'vercel', 'buffer', 'whatsapp', 'payments']);

  router.add('GET', '/api/owner/connections', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { connections: await listConnections(platform, { site: site() }) };
  });

  // Keys are written once and never read back: the answer says only whether the account now answers.
  router.add('PUT', '/api/owner/connections/:id', 'owner', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    const id = check(connectionId, params.id);
    const result = await saveConnection(platform, id, json.values);
    await audit(db, {
      actor: staff.actor,
      type: 'connection.saved',
      subject: { type: 'connector', id },
      data: {
        fields: Object.keys((json.values as Record<string, unknown>) ?? {}),
        mode: result.mode,
        ok: result.health?.ok ?? null,
      },
    });
    return result;
  });

  router.add('POST', '/api/owner/connections/:id/check', 'owner', async ({ caller, params }) => {
    staffOf(caller);
    return checkConnection(platform, check(connectionId, params.id));
  });

  router.add('POST', '/api/owner/connections/:id/disconnect', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    const id = check(connectionId, params.id);
    await disconnect(platform, id);
    await audit(db, { actor: staff.actor, type: 'connection.removed', subject: { type: 'connector', id }, data: {} });
    return { mode: 'mock' };
  });

  router.add('POST', '/api/owner/connections/gmail/sign-in', 'owner', async ({ caller }) => {
    staffOf(caller);
    return startGoogleSignIn(platform, `${site()}/api/connect/gmail/callback`);
  });

  // The owner app asks for new mail each time it refreshes. The inbox is read at most once a minute.
  router.add('POST', '/api/owner/inbox/sync', 'staff', async ({ caller, json }) => {
    staffOf(caller);
    return syncGmail(platform, { force: json.force === true });
  });

  router.add('GET', '/api/owner/rules', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { rules: await listRules(db) };
  });

  router.add('POST', '/api/owner/rules', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const body = check(
      z.strictObject({
        name: z.string().min(1).max(100),
        action_type: z.string(),
        conditions: z
          .strictObject({ template: z.string().optional(), recipient: z.literal('order_buyer').optional() })
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
      }),
      json,
    );
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

  // ---------------------------------------------------------------- The departments (blueprint 7) and the command center (8.3)

  router.add('GET', '/api/owner/agents', 'staff', async ({ caller }) => {
    staffOf(caller);
    const since = new Date(clock().getTime() - 86_400_000);
    const departments = await db.query(
      `select a.id, a.name, a.mission, a.enabled,
              count(r.id) filter (where r.started_at > $1)::int as runs_today,
              count(r.id) filter (where r.started_at > $1 and r.status = 'failed')::int as failed_today,
              coalesce(sum(r.cost_micros) filter (where r.started_at > $1), 0)::int as cost_today_micros,
              max(r.started_at) as last_run_at
       from agents a left join agent_runs r on r.agent_id = a.id and r.workflow <> 'read_outside_content'
       group by a.id order by array_position(array['operations','sales','support','marketing','engineering','commerce','finance','security'], a.id)`,
      [since],
    );
    const jobs = (
      await db.query<{ queued: number; failed: number }>(
        `select count(*) filter (where status in ('queued', 'running'))::int as queued, count(*) filter (where status = 'failed')::int as failed from jobs`,
      )
    )[0];
    const briefing = (
      await db.query(
        `select id, started_at, model, output from agent_runs where workflow = 'operations.daily_briefing' and status = 'succeeded' order by started_at desc limit 1`,
      )
    )[0];
    return { mode: await platform.agents.mode(), departments, jobs, briefing: briefing ?? null };
  });

  router.add('GET', '/api/owner/agents/runs', 'staff', async ({ caller, request }) => {
    staffOf(caller);
    return {
      runs: await db.query(
        `select id, agent_id, workflow, trigger_kind, task_id, status, untrusted_input, output, error, model, input_tokens, output_tokens, cost_micros, started_at, finished_at
         from agent_runs where workflow <> 'read_outside_content' and ($1::text is null or agent_id = $1) order by started_at desc limit 100`,
        [request.query.department ?? null],
      ),
    };
  });

  router.add('GET', '/api/owner/agents/jobs', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { jobs: await listJobs(db) };
  });

  // Work the owner may start by hand. Anything that leaves the company still goes through the gateway.
  const RUNNABLE = [
    'operations.daily_briefing',
    'security.review',
    'finance.money_status',
    'commerce.catalog_check',
    'sales.qualify_leads',
    'sales.reply_new_leads',
    'support.triage_inbox',
  ];
  router.add('POST', '/api/owner/agents/run', 'owner', async ({ caller, json }) => {
    staffOf(caller);
    const body = check(z.strictObject({ workflow: z.enum(RUNNABLE as [string, ...string[]]).optional() }), json);
    if (!body.workflow) return { ran: await platform.agents.runDue({ budgetMs: 25_000 }) };
    return {
      workflow: body.workflow,
      result: await platform.agents.runWorkflow(body.workflow, {}, { trigger: 'manual' }),
    };
  });

  router.add('GET', '/api/owner/commands', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { commands: await listCommands(db) };
  });

  router.add('POST', '/api/owner/commands', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const body = check(z.strictObject({ instruction: z.string().min(3).max(2000) }), json);
    return { command: await planCommand(platform.agents, body.instruction, staff.actor) };
  });

  router.add('GET', '/api/owner/commands/:id', 'staff', async ({ caller, params }) => {
    staffOf(caller);
    return { command: await getCommand(db, check(z.uuid(), params.id)) };
  });

  router.add('POST', '/api/owner/commands/:id/start', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    await startCommand(platform.agents, check(z.uuid(), params.id), staff.actor);
    return { command: await getCommand(db, params.id!) };
  });

  router.add('POST', '/api/owner/memory/:key/approve', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    return { item: await approveMemory(db, params.key!, staff.actor, staff.isOwner) };
  });
}

export type { RouteContext };
