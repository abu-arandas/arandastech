import { saleProfit } from '../finance/pricing';
import { post, type Posting } from '../finance/ledger';
import type { Gateway } from '../governance/gateway';
import { getPolicy } from '../governance/settings';
import { maybeOne, one } from '../lib/db';
import type { Clock, Locale } from '../lib/types';
import { SYSTEM } from '../lib/types';
import { costPricing, FULFILLMENT, lockedOrder, lockOrder, moveOrder, type PaymentRow, storePosting } from './orders';

/** What the gateway needs from the store: the checks before, and the bookkeeping after, each store action. */
export function registerStoreActions(gateway: Gateway, clock: Clock): void {
  registerPublishProduct(gateway);
  registerRefund(gateway, clock);
  registerSupplierOrder(gateway, clock);
  registerEmailSent(gateway, clock);
}

/** A product goes on sale only with a healthy margin and, when physical, an approved supplier that delivers in time. */
function registerPublishProduct(g: Gateway): void {
  g.guard('store.publish_product', async (db, payload, requester) => {
    const product = maybeOne(
      await db.query<{
        id: string;
        status: string;
        kind: string;
        supplier_id: string | null;
        delivery_days: number | null;
      }>('select id, status, kind, supplier_id, delivery_days from products where id = $1', [payload.product_id]),
    );
    if (!product) return ['unknown_product'];
    if (!['draft', 'pending_approval', 'paused'].includes(product.status)) return [`product_is_${product.status}`];
    const reasons: string[] = [];
    const minimum = await getPolicy(db, 'margin.min_product_bps');
    const variants = await db.query<{ sku: string; price_minor: number; currency: string; unit_cost_minor: number }>(
      'select sku, price_minor, currency, unit_cost_minor from product_variants where product_id = $1 and active',
      [product.id],
    );
    if (!variants.length) reasons.push('no_active_variant');
    for (const v of variants) {
      const profit = saleProfit(v.price_minor, await costPricing(db, v.currency, v.unit_cost_minor));
      if (profit.marginBps < minimum)
        reasons.push(
          `margin_below_minimum: ${v.sku} makes ${(profit.marginBps / 100).toFixed(1)}%, the minimum is ${(minimum / 100).toFixed(1)}%`,
        );
    }
    if (product.kind === 'physical') {
      const supplier = maybeOne(
        await db.query<{ status: string }>('select status from suppliers where id = $1', [product.supplier_id]),
      );
      if (supplier?.status !== 'approved') reasons.push('supplier_not_approved');
      const limit = await getPolicy(db, 'shipping.max_delivery_days');
      if (product.delivery_days === null) reasons.push('delivery_time_unknown');
      else if (limit !== null && product.delivery_days > limit)
        reasons.push(`delivery_time_over_maximum: ${product.delivery_days} days, the maximum is ${limit}`);
    }
    // A blocked offer goes ahead only when the owner overrides it and records a reason (blueprint 6.2).
    const overridden = requester.kind === 'person' && typeof payload.override_reason === 'string';
    return overridden ? [] : reasons;
  });
  g.handle('store.publish_product', async (db, payload) => {
    await db.query(`update products set status = 'published', published_at = now() where id = $1`, [
      payload.product_id,
    ]);
    return { published: true };
  });
}

/** A refund never exceeds what is left to refund, and its money is booked the way the payment was. */
function registerRefund(g: Gateway, clock: Clock): void {
  g.guard('payments.refund', async (db, payload) => {
    const refund = maybeOne(
      await db.query<{ status: string; amount_minor: number; order_id: string; payment_id: string }>(
        'select status, amount_minor, order_id, payment_id from refunds where id = $1',
        [payload.refund_id],
      ),
    );
    if (!refund || refund.order_id !== payload.order_id) return ['unknown_refund'];
    if (refund.status !== 'proposed') return [`refund_is_${refund.status}`];
    const payment = one(await db.query<PaymentRow>('select * from payments where id = $1', [refund.payment_id]));
    if (Number(payload.amount_minor) > payment.amount_minor - payment.refunded_minor) return ['amount_over_refundable'];
    if (payment.provider_ref !== payload.payment_ref || payment.currency !== payload.currency)
      return ['payment_mismatch'];
    return [];
  });
  g.onExecuted('payments.refund', async (db, action, result) => {
    const p = action.payload as { refund_id: string; order_id: string; amount_minor: number; currency: string };
    const now = clock();
    const refund = one(
      await db.query<{ payment_id: string }>(
        `update refunds set status = 'executed', provider_ref = $2, executed_at = $3 where id = $1 returning payment_id`,
        [p.refund_id, String(result.refund_ref ?? ''), now],
      ),
    );
    const before = one(
      await db.query<PaymentRow>('select * from payments where id = $1 for update', [refund.payment_id]),
    );
    const refunded = before.refunded_minor + p.amount_minor;
    const full = refunded >= before.amount_minor;
    await db.query(
      `update payments set refunded_minor = $2, status = case when $3 then 'refunded' when status = 'pending' then 'pending' else 'partially_refunded' end where id = $1`,
      [before.id, refunded, full],
    );
    // Money that never cleared was never the company's: the sale is reversed. Cleared money is a refund against the balance.
    const ref = { type: 'refund', id: p.refund_id };
    const postings: Posting[] =
      before.status === 'pending'
        ? [
            storePosting('pending_revenue', -p.amount_minor, p.currency, ref, 'Reversed before it cleared'),
            storePosting('gross_revenue', -p.amount_minor, p.currency, ref, 'Reversed before it cleared'),
          ]
        : [storePosting('refunds', p.amount_minor, p.currency, ref, 'Refunded to the customer')];
    const order = await lockedOrder(db, p.order_id);
    const unplaced = await db.query<{ id: string; cost_minor: number }>(
      `update shipments set status = 'failed' where order_id = $1 and status = 'requested' returning id, cost_minor`,
      [p.order_id],
    );
    for (const s of unplaced)
      postings.push(
        storePosting('supplier_obligations', -s.cost_minor, p.currency, ref, 'Supplier order never placed'),
      );
    await post(db, postings, now);
    if (full) {
      await db.query(
        `update licenses set revoked_at = $2 where revoked_at is null and order_item_id in (select id from order_items where order_id = $1)`,
        [p.order_id, now],
      );
      if (order.status !== 'refunded')
        await moveOrder(db, order, 'refunded', { kind: action.requested_by_kind, id: action.requested_by_id }, now, {
          refund_id: p.refund_id,
          amount_minor: p.amount_minor,
        });
    }
  });
  g.onRejected('payments.refund', async (db, action) => {
    await db.query(`update refunds set status = 'rejected' where id = $1 and status = 'proposed'`, [
      action.payload.refund_id,
    ]);
  });
}

/** A supplier order matches its shipment, goes only to an approved supplier, and books the cost of goods. */
function registerSupplierOrder(g: Gateway, clock: Clock): void {
  g.guard('supplier.place_order', async (db, payload) => {
    const shipment = maybeOne(
      await db.query<{ status: string; cost_minor: number; order_id: string }>(
        'select status, cost_minor, order_id from shipments where id = $1',
        [payload.shipment_id],
      ),
    );
    if (!shipment || shipment.order_id !== payload.order_id) return ['unknown_shipment'];
    if (shipment.status !== 'requested') return [`shipment_is_${shipment.status}`];
    if (shipment.cost_minor !== payload.amount_minor) return ['amount_does_not_match_the_order'];
    const supplier = maybeOne(
      await db.query<{ status: string }>('select status from suppliers where id = $1', [payload.supplier_id]),
    );
    return supplier?.status === 'approved' ? [] : ['supplier_not_approved'];
  });
  g.onExecuted('supplier.place_order', async (db, action, result) => {
    const p = action.payload as { shipment_id: string; order_id: string; amount_minor: number; currency: string };
    await db.query(`update shipments set status = 'placed', supplier_ref = $2, action_id = $3 where id = $1`, [
      p.shipment_id,
      String(result.supplier_ref ?? ''),
      action.id,
    ]);
    const shipment = { type: 'shipment', id: p.shipment_id };
    await post(
      db,
      [
        storePosting('supplier_obligations', -p.amount_minor, p.currency, shipment, 'Paid to the supplier'),
        storePosting('product_cost', p.amount_minor, p.currency, shipment, 'Cost of goods for this order'),
      ],
      clock(),
    );
    const order = await lockedOrder(db, p.order_id);
    if (order.status === 'paid')
      await moveOrder(db, order, 'fulfilling', FULFILLMENT, clock(), { supplier_ref: result.supplier_ref });
  });
  g.onRejected('supplier.place_order', async (db, action) => {
    const order = await lockOrder(db, action.payload.order_id);
    if (order?.status === 'paid')
      await moveOrder(db, order, 'on_hold', SYSTEM, clock(), { reason: 'supplier_order_not_approved' });
  });
}

/** Every email sent is kept with its lead or order; a delivered license moves its order to delivered. */
function registerEmailSent(g: Gateway, clock: Clock): void {
  g.onExecuted('gmail.send_email', async (db, action) => {
    const p = action.payload as {
      to: string;
      subject: string;
      body: string;
      locale: Locale;
      template?: string;
      lead_id?: string;
      order_id?: string;
    };
    await db.query(
      `insert into messages (lead_id, order_id, channel, direction, to_address, subject, body, locale, untrusted, handled, action_id)
       values ($1, $2, 'email', 'out', $3, $4, $5, $6, false, true, $7)`,
      [p.lead_id ?? null, p.order_id ?? null, p.to, p.subject, p.body, p.locale, action.id],
    );
    if (p.lead_id)
      await db.query(`update messages set handled = true where lead_id = $1 and direction = 'in'`, [p.lead_id]);
    if (p.template === 'license-delivery' && p.order_id) {
      const order = await lockedOrder(db, p.order_id);
      if (order.status === 'fulfilling')
        await moveOrder(db, order, 'delivered', FULFILLMENT, clock(), { delivered_by: 'email' });
    }
  });
}
