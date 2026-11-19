import { z } from 'zod';
import { signedEvent } from '../commerce/webhooks';
import { listMockDeliveries } from '../connectors/mock';
import { livePayments } from '../connectors/registry';
import { recordInbound } from '../crm/crm';
import { AppError } from '../lib/errors';
import type { Platform } from '../platform';
import { check } from './guards';
import type { Router } from './http';

/** Demo mode only: stand-ins for the outside world (a card payment, a settlement, a supplier update, an email). */
export function registerDemoRoutes(router: Router, platform: Platform): void {
  const { db, store } = platform;

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
}
