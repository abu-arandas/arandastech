import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signedEvent } from '../src/commerce/store';
import { listMockDeliveries } from '../src/connectors/mock';
import { moneySummary } from '../src/finance/ledger';
import { listOpenApprovals } from '../src/governance/approvals';
import { verifyAuditChain } from '../src/governance/audit';
import { pause, resume } from '../src/governance/pause';
import { revokeRule } from '../src/governance/rules';
import type { Db } from '../src/lib/db';
import { AppError } from '../src/lib/errors';
import { asOwner, createTestPlatform, OWNER, SECRETS, type TestPlatform } from './helpers/platform';

let t: TestPlatform;
let db: Db;
const buyer = { name: 'Layla Haddad', email: 'layla@example.com' };
let key = 0;
const nextKey = (): string => `checkout-key-${(key += 1)}`;

beforeAll(async () => {
  t = await createTestPlatform();
  db = t.test.db;
});
afterAll(async () => t.test.drop());

const code = async (work: Promise<unknown>): Promise<string> => work.then(() => 'no error', (e: unknown) => (e instanceof AppError ? e.code : `unexpected: ${String(e)}`));
const pendingFor = async (type: string) => (await listOpenApprovals(db, t.clock.now())).filter((r) => r.action.action_type === type);

/** Checks out and lets the mock provider confirm the payment. */
async function buy(sku: string, options: { quantity?: number; address?: string; locale?: 'en' | 'ar' } = {}) {
  const { order, session } = await t.platform.store.createCheckout({
    items: [{ sku, quantity: options.quantity ?? 1 }],
    buyer,
    locale: options.locale ?? 'en',
    shippingAddress: options.address,
    idempotencyKey: nextKey(),
  });
  const paymentRef = `pay_${order.number}`;
  const captured = await t.paymentEvent('payment.captured', { session, payment_ref: paymentRef, amount_minor: order.total_minor, currency: order.currency });
  return { order, session, paymentRef, captured };
}

describe('catalog and checkout', () => {
  it('lists what is published', async () => {
    const catalog = await t.platform.store.catalog();
    expect(catalog.map((p) => p.slug)).toEqual(['zirr-retail', 'zirr-boutique', 'test-physical']);
    expect(catalog[0]!.variants.map((v) => v.sku)).toEqual(['RETAIL-DEV', 'RETAIL-AGENCY']);
  });

  it('refuses an order that cannot be fulfilled', async () => {
    const order = (items: Array<{ sku: string; quantity: number }>, shippingAddress?: string) => t.platform.store.createCheckout({ items, buyer, locale: 'en', shippingAddress, idempotencyKey: nextKey() });
    expect(await code(order([{ sku: 'NO-SUCH-SKU', quantity: 1 }]))).toBe('invalid');
    expect(await code(order([{ sku: 'RETAIL-DEV', quantity: 2 }]))).toBe('invalid');
    expect(await code(order([{ sku: 'TEST-PHYS-1', quantity: 1 }]))).toBe('invalid');
    expect(await code(order([{ sku: 'RETAIL-DEV', quantity: 1 }, { sku: 'TEST-PHYS-1', quantity: 1 }], 'Amman, Jordan'))).toBe('invalid');
  });

  it('returns the same order for a repeated checkout request', async () => {
    const input = { items: [{ sku: 'BOUTIQUE-REGULAR', quantity: 1 }], buyer, locale: 'en' as const, idempotencyKey: 'same-key-twice' };
    const first = await t.platform.store.createCheckout(input);
    const second = await t.platform.store.createCheckout(input);
    expect(second.duplicate).toBe(true);
    expect(second.order.id).toBe(first.order.id);
  });
});

describe('a license sale, from payment to refund', () => {
  let orderId: string;
  let paymentRef: string;

  it('counts a payment only when the provider confirms it, and only once', async () => {
    const { order, session } = await t.platform.store.createCheckout({ items: [{ sku: 'RETAIL-DEV', quantity: 1 }], buyer, locale: 'ar', idempotencyKey: nextKey() });
    orderId = order.id;
    paymentRef = `pay_${order.number}`;
    expect(order.status).toBe('pending_payment');
    expect(order.total_minor).toBe(5900);

    const forged = signedEvent('wrong-secret', 'payment.captured', { session, payment_ref: paymentRef, amount_minor: 5900, currency: 'USD' });
    expect(await code(t.platform.store.handlePaymentWebhook(forged.body, forged.signature))).toBe('bad_signature');
    expect((await t.platform.store.order(orderId)).status).toBe('pending_payment');

    const data = { session, payment_ref: paymentRef, amount_minor: 5900, currency: 'USD' };
    const first = await t.paymentEvent('payment.captured', data, 'evt_capture_1');
    const again = await t.paymentEvent('payment.captured', data, 'evt_capture_1');
    const otherId = await t.paymentEvent('payment.captured', data, 'evt_capture_1_resent');
    expect(first).toEqual({ duplicate: false, result: 'paid' });
    expect(again.duplicate).toBe(true);
    expect(otherId.result).toBe('order_already_paid');

    const [payments] = await db.query<{ n: number }>('select count(*)::int as n from payments where order_id = $1', [orderId]);
    const [gross] = await db.query<{ total: number }>(`select sum(amount_minor)::int as total from ledger_entries where ref_id = $1 and account = 'gross_revenue'`, [orderId]);
    expect(payments!.n).toBe(1);
    expect(gross!.total).toBe(5900);
  });

  it('delivers the license automatically, in the buyer\'s language', async () => {
    const order = await t.platform.store.order(orderId);
    expect(order.status).toBe('delivered');
    const [license] = await db.query<{ license_key: string; holder_name: string; kind: string; support_until: Date }>('select l.* from licenses l join order_items i on i.id = l.order_item_id where i.order_id = $1', [orderId]);
    expect(license!.holder_name).toBe(buyer.name);
    expect(license!.kind).toBe('developer');
    expect(Math.round((license!.support_until.getTime() - t.clock.now().getTime()) / 86_400_000)).toBe(30);
    const email = (await listMockDeliveries(db, 'gmail')).find((d) => d.payload.order_id === orderId);
    expect(email!.payload.to).toBe(buyer.email);
    expect(String(email!.payload.subject)).toContain('ترخيصك');
    expect(String(email!.payload.body)).toContain(license!.license_key);
  });

  it('shows the sale as pending, not as money, until it settles', async () => {
    const summary = await moneySummary(db, 'USD', t.clock.now());
    expect(summary.engines.commerce.gross_revenue).toBe(5900);
    expect(summary.pending_revenue).toBe(5900);
    expect(summary.engines.commerce.settled_revenue).toBe(0);
    expect(summary.waterfall.available_cash).toBe(0);
    expect(summary.status).toBe('not_safe_to_spend');
    expect(summary.reasons).toContain('revenue_pending');
  });

  it('shows the fee, the reserve and the profit separately once it settles', async () => {
    expect((await t.paymentEvent('payment.settled', { payment_ref: paymentRef, fee_minor: 201 })).result).toBe('settled');
    expect((await t.paymentEvent('payment.settled', { payment_ref: paymentRef, fee_minor: 201 })).result).toBe('already_settled');
    const summary = await moneySummary(db, 'USD', t.clock.now());
    expect(summary.pending_revenue).toBe(0);
    expect(summary.engines.commerce.settled_revenue).toBe(5900);
    expect(summary.engines.commerce.payment_fees).toBe(201);
    expect(summary.waterfall.settled_balance).toBe(5699);
    expect(summary.waterfall.refund_and_dispute_reserve).toBe(590);
    expect(summary.waterfall.available_cash).toBe(5109);
    expect(summary.waterfall.confirmed_net_profit).toBe(5109);
    expect(summary.waterfall.approved_reinvestment_budget).toBe(2555);
    expect(summary.status).toBe('safe_to_consider_upgrade');
  });

  it('refunds only with the owner\'s confirmed approval, and posts it to the ledger', async () => {
    expect(await code(t.platform.store.proposeRefund(orderId, { amountMinor: 9999, reason: 'Too much' }, { kind: 'agent', id: 'finance' }))).toBe('invalid');
    const { action, refundId } = await t.platform.store.proposeRefund(orderId, { reason: 'Requested inside the license terms.' }, { kind: 'agent', id: 'finance' });
    expect(action.status).toBe('pending');
    expect(action.level).toBe(3);
    expect((await listMockDeliveries(db, 'payments')).length).toBe(0);

    const [request] = await pendingFor('payments.refund');
    expect(await code(t.platform.gateway.decide(request!.id, { decision: 'approve', ...asOwner }))).toBe('invalid');
    const done = await t.platform.gateway.decide(request!.id, { decision: 'approve', ...asOwner, confirmation: { amount_minor: 5900, recipient: buyer.email } });
    expect(done.action.status).toBe('executed');

    expect((await t.platform.store.order(orderId)).status).toBe('refunded');
    const [refund] = await db.query<{ status: string; provider_ref: string }>('select status, provider_ref from refunds where id = $1', [refundId]);
    expect(refund!.status).toBe('executed');
    const [license] = await db.query<{ revoked_at: Date | null }>('select l.revoked_at from licenses l join order_items i on i.id = l.order_item_id where i.order_id = $1', [orderId]);
    expect(license!.revoked_at).not.toBeNull();

    const summary = await moneySummary(db, 'USD', t.clock.now());
    expect(summary.engines.commerce.refunds).toBe(5900);
    expect(summary.waterfall.settled_balance).toBe(-201);
    expect(summary.status).toBe('not_safe_to_spend');
    expect(await code(t.platform.store.proposeRefund(orderId, { reason: 'Again' }, OWNER))).toBe('invalid');
  });

  it('marks a refund the owner rejects as rejected, and moves no money', async () => {
    const { order } = await buy('BOUTIQUE-EXTENDED');
    const { refundId } = await t.platform.store.proposeRefund(order.id, { reason: 'Changed their mind.' }, { kind: 'agent', id: 'support' });
    const [request] = await pendingFor('payments.refund');
    await t.platform.gateway.decide(request!.id, { decision: 'reject', ...asOwner, note: 'Outside the license terms.' });
    const [refund] = await db.query<{ status: string }>('select status from refunds where id = $1', [refundId]);
    expect(refund!.status).toBe('rejected');
    expect((await t.platform.store.order(order.id)).status).toBe('delivered');
  });
});

describe('a physical order', () => {
  it('waits for the owner before anything is ordered from the supplier', async () => {
    const { order, captured } = await buy('TEST-PHYS-1', { quantity: 2, address: 'Rainbow Street 10, Amman, Jordan' });
    expect(captured.result).toBe('paid');
    expect(order.currency).toBe('JOD');
    expect(order.total_minor).toBe(10_000);
    expect((await t.platform.store.order(order.id)).status).toBe('paid');
    expect((await moneySummary(db, 'JOD', t.clock.now())).waterfall.supplier_obligations).toBe(4000);
    expect((await listMockDeliveries(db, 'supplier')).length).toBe(0);

    const [request] = await pendingFor('supplier.place_order');
    expect(request!.level).toBe(3);
    expect(request!.action.cost_minor).toBe(4000);
    await t.platform.gateway.decide(request!.id, { decision: 'approve', ...asOwner, confirmation: { amount_minor: 4000, recipient: 'Mock supplier' } });

    expect((await t.platform.store.order(order.id)).status).toBe('fulfilling');
    const summary = await moneySummary(db, 'JOD', t.clock.now());
    expect(summary.waterfall.supplier_obligations).toBe(0);
    expect(summary.engines.commerce.product_cost).toBe(4000);

    const [shipment] = await db.query<{ supplier_ref: string }>('select supplier_ref from shipments where order_id = $1', [order.id]);
    expect((await t.supplierEvent('shipment.updated', { supplier_ref: shipment!.supplier_ref, status: 'shipped', tracking: 'TRACK123' })).result).toBe('shipped');
    expect((await t.platform.store.order(order.id)).status).toBe('shipped');
    await t.supplierEvent('shipment.updated', { supplier_ref: shipment!.supplier_ref, status: 'delivered' });
    expect((await t.platform.store.order(order.id)).status).toBe('delivered');
  });

  it('holds the order when the owner does not approve the supplier order', async () => {
    const { order } = await buy('TEST-PHYS-1', { address: 'Rainbow Street 10, Amman, Jordan' });
    const [request] = await pendingFor('supplier.place_order');
    await t.platform.gateway.decide(request!.id, { decision: 'reject', ...asOwner });
    const held = await t.platform.store.order(order.id);
    expect(held.status).toBe('on_hold');
    expect(held.hold_reason).toBe('supplier_order_not_approved');
  });
});

describe('safeguards', () => {
  it('stops new orders while orders are paused', async () => {
    await pause(db, { scope: 'orders' }, 'test', OWNER);
    expect(await code(t.platform.store.createCheckout({ items: [{ sku: 'RETAIL-DEV', quantity: 1 }], buyer, locale: 'en', idempotencyKey: nextKey() }))).toBe('paused');
    await resume(db, { scope: 'orders' }, OWNER, true);
  });

  it('holds a paid order while fulfillment is paused, for the owner to release', async () => {
    const { order, session } = await t.platform.store.createCheckout({ items: [{ sku: 'RETAIL-AGENCY', quantity: 1 }], buyer, locale: 'en', idempotencyKey: nextKey() });
    await pause(db, { scope: 'fulfillment' }, 'test', { kind: 'agent', id: 'security' });
    const result = await t.paymentEvent('payment.captured', { session, payment_ref: `pay_${order.number}`, amount_minor: order.total_minor, currency: 'USD' });
    expect(result.result).toBe('held_paused');
    expect((await t.platform.store.order(order.id)).hold_reason).toBe('fulfillment_paused');
    expect(await code(t.platform.store.release(order.id, { kind: 'agent', id: 'commerce' }, false))).toBe('forbidden');
    await resume(db, { scope: 'fulfillment' }, OWNER, true);
    expect((await t.platform.store.release(order.id, OWNER, true)).status).toBe('delivered');
  });

  it('holds an order that was paid the wrong amount', async () => {
    const { order, session } = await t.platform.store.createCheckout({ items: [{ sku: 'RETAIL-DEV', quantity: 1 }], buyer, locale: 'en', idempotencyKey: nextKey() });
    const result = await t.paymentEvent('payment.captured', { session, payment_ref: `pay_${order.number}`, amount_minor: 59, currency: 'USD' });
    expect(result.result).toBe('held_amount_mismatch');
    const [alert] = await db.query<{ n: number }>(`select count(*)::int as n from security_alerts where kind = 'amount_mismatch'`);
    expect(alert!.n).toBe(1);
  });

  it('asks the owner before delivering when no standing rule covers it', async () => {
    const [rule] = await db.query<{ id: string }>(`select id from standing_rules where name = 'License delivery'`);
    await revokeRule(db, rule!.id, OWNER, true);
    const { order } = await buy('BOUTIQUE-REGULAR');
    expect((await t.platform.store.order(order.id)).status).toBe('fulfilling');
    const [request] = (await pendingFor('gmail.send_email')).filter((r) => r.action.payload.order_id === order.id);
    expect(request!.level).toBe(2);
    await t.platform.gateway.decide(request!.id, { decision: 'approve', ...asOwner });
    expect((await t.platform.store.order(order.id)).status).toBe('delivered');
  });

  it('blocks a product whose margin is under the minimum, unless the owner overrides it with a reason', async () => {
    const [product] = await db.query<{ id: string }>(`insert into products (slug, kind, name, summary) values ('thin-margin', 'digital', '{"en": "Thin", "ar": "Thin"}', '{"en": "", "ar": ""}') returning id`);
    await db.query(`insert into product_variants (product_id, sku, name, price_minor, currency, unit_cost_minor) values ($1, 'THIN-1', '{"en": "One", "ar": "One"}', 1000, 'USD', 900)`, [product!.id]);
    const blocked = await t.platform.gateway.propose({ type: 'store.publish_product', payload: { product_id: product!.id }, requester: { kind: 'agent', id: 'commerce' } });
    expect(blocked.action.status).toBe('blocked');
    expect(String(blocked.action.reasons[0])).toMatch(/^margin_below_minimum: THIN-1 makes 5\.0%, the minimum is 20\.0%/);
    const agentOverride = await t.platform.gateway.propose({ type: 'store.publish_product', payload: { product_id: product!.id, override_reason: 'Trust me, it will sell.' }, requester: { kind: 'agent', id: 'commerce' } });
    expect(agentOverride.action.status).toBe('blocked');

    const overridden = await t.platform.gateway.propose({ type: 'store.publish_product', payload: { product_id: product!.id, override_reason: 'Loss leader for the launch week.' }, requester: OWNER });
    expect(overridden.action.status).toBe('pending');
    await t.platform.gateway.decide(overridden.request!.id, { decision: 'approve', ...asOwner });
    const [after] = await db.query<{ status: string }>('select status from products where id = $1', [product!.id]);
    expect(after!.status).toBe('published');
  });

  it('records a dispute and freezes the order', async () => {
    const { order, paymentRef } = await buy('RETAIL-DEV');
    await t.paymentEvent('dispute.opened', { payment_ref: paymentRef, dispute_ref: 'dp_1', reason: 'item_not_received' });
    expect((await t.platform.store.order(order.id)).disputed).toBe(true);
    expect((await moneySummary(db, 'USD', t.clock.now())).open_disputes).toBe(1);
  });

  it('lets a buyer see only their own order', async () => {
    const { order } = await buy('RETAIL-DEV');
    // The delivery rule was revoked above, so this order waits for the owner. The buyer sees exactly that.
    expect((await t.platform.store.publicStatus(order.number, buyer.email))?.status).toBe((await t.platform.store.order(order.id)).status);
    expect(await t.platform.store.publicStatus(order.number, 'someone@else.example')).toBeNull();
  });

  it('leaves an intact audit chain behind', async () => {
    expect(await verifyAuditChain(db)).toBeNull();
    expect(SECRETS.payments).not.toBe(SECRETS.supplier);
  });
});
