import { z } from 'zod';
import { listInbox, listLeads } from '../crm/crm';
import { ledgerCurrencies, moneySummary } from '../finance/ledger';
import type { Db } from '../lib/db';
import type { Platform } from '../platform';
import { check, staffOf } from './guards';
import type { Router } from './http';

/** The money summary for every currency the books hold, USD and JOD always first. */
export async function moneyByCurrency(db: Db, now: Date) {
  const currencies = [...new Set(['USD', 'JOD', ...(await ledgerCurrencies(db))])];
  return Promise.all(currencies.map((currency) => moneySummary(db, currency, now)));
}

/** The business as the owner app shows it: leads, the inbox, products, orders and money. */
export function registerBusinessRoutes(router: Router, platform: Platform): void {
  const { db, store, gateway, clock } = platform;

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
    return { summaries: await moneyByCurrency(db, clock()) };
  });
}
