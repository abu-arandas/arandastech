import { z } from 'zod';
import { livePayments, paytabsCallback, whatsappWebhook } from '../connectors/registry';
import { readConnection } from '../connectors/connections';
import { createLead } from '../crm/crm';
import { optedOut, optOut } from '../crm/deliverability';
import { handleGumroadPing } from '../crm/gumroad';
import { getPolicy } from '../governance/settings';
import { AppError } from '../lib/errors';
import type { Platform } from '../platform';
import { check } from './guards';
import type { Router } from './http';

/** The website and the storefront: the catalog, leads, checkout and payment, order lookups, and the webhooks the outside world calls. */
export function registerPublicRoutes(router: Router, platform: Platform): void {
  const { db, store, clock } = platform;

  router.add('GET', '/api/public/catalog', 'public', async () => ({ products: await store.catalog() }));

  router.add('GET', '/api/public/packages', 'public', async () => ({
    packages: await db.query(
      `select id, name, outcome, audience, deliverables, price_kind from service_packages where status = 'approved' order by sort`,
    ),
  }));

  // The trial page shows the free days the policy sheet promises, so the page and the emails always agree.
  router.add('GET', '/api/public/trial', 'public', async () => ({ days: await getPolicy(db, 'billing.trial_days') }));

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
    gumroad: await gumroadShop(platform),
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

  // The one-click unsubscribe (RFC 8058): mail apps post here from their own button, and the page's button does too.
  router.add('POST', '/api/public/unsubscribe/:token', 'public', async ({ params }) => ({
    done: await optOut(db, params.token!, clock()),
  }));
  // The page shows "done" only when the records say so, not because its address says so.
  router.add('GET', '/api/public/unsubscribe/:token', 'public', async ({ params }) => ({
    stopped: await optedOut(db, params.token!),
  }));

  router.add('POST', '/api/webhooks/payments', 'public', async ({ request }) =>
    store.handlePaymentWebhook(request.body, request.headers['x-signature']),
  );
  router.add('POST', '/api/webhooks/paytabs', 'public', async ({ request }) =>
    paytabsCallback(platform, request.body, request.headers.signature),
  );
  router.add('POST', '/api/webhooks/gumroad/:key', 'public', async ({ request, params }) =>
    handleGumroadPing(db, params.key!, request.body, clock()),
  );
  router.add('POST', '/api/webhooks/whatsapp', 'public', async ({ request }) =>
    whatsappWebhook(platform, request.body, request.headers['x-hub-signature-256']),
  );
  router.add('POST', '/api/webhooks/supplier', 'public', async ({ request }) =>
    store.handleSupplierWebhook(request.body, request.headers['x-signature']),
  );
}

/** Where the storefront sends a buyer while its own card checkout is closed: the owner's Gumroad shop, if connected. */
async function gumroadShop(platform: Platform): Promise<{ shop_url: string; products: string[] } | null> {
  const saved = await readConnection(platform.db, 'gumroad');
  if (!saved.shop_url || !saved.products || !saved.ping_key) return null;
  return { shop_url: saved.shop_url, products: saved.products.split(',').map((p) => p.trim().toLowerCase()) };
}
