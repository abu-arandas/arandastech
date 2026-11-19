import { z } from 'zod';
import { post, type Posting } from '../finance/ledger';
import { audit } from '../governance/audit';
import type { ActionRow } from '../governance/approvals';
import type { Gateway } from '../governance/gateway';
import { activePause } from '../governance/pause';
import { getPolicy } from '../governance/settings';
import { type Db, json, maybeOne, one } from '../lib/db';
import { AppError, forbidden, invalid, notFound } from '../lib/errors';
import { parseOrRefuse } from '../lib/validate';
import { hmacSha256, randomToken, sameSignature } from '../lib/hash';
import { formatMoney } from '../lib/money';
import type { Actor, Clock, Localized } from '../lib/types';
import { pick, SYSTEM } from '../lib/types';
import { renderTemplate } from '../memory';
import {
  FULFILLMENT,
  moveOrder,
  storePosting,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
  type PaymentRow,
  type VariantRow,
} from './orders';
import { registerStoreActions } from './store-actions';

const checkoutInput = z.strictObject({
  items: z
    .array(z.strictObject({ sku: z.string().min(1).max(80), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(10),
  buyer: z.strictObject({ name: z.string().trim().min(1).max(120), email: z.email().max(200) }),
  locale: z.enum(['en', 'ar']),
  shippingAddress: z.string().trim().min(5).max(500).optional(),
  idempotencyKey: z.string().min(8).max(100),
});
export type CheckoutInput = z.input<typeof checkoutInput>;

const providerEvent = z.object({
  id: z.string().min(1).max(120),
  type: z.string().min(1).max(60),
  data: z.record(z.string(), z.unknown()),
});

export interface StoreOptions {
  /** Shared secrets that sign each provider's webhooks. */
  webhookSecrets: { payments: string; supplier: string };
  /** Test products can be bought only in demo mode. */
  allowTestProducts: boolean;
}

/** The online store: catalog, checkout, verified payments, delivery and refunds (blueprint 5.2). */
export class Store {
  constructor(
    private readonly db: Db,
    private readonly gateway: Gateway,
    private readonly clock: Clock,
    private readonly options: StoreOptions,
  ) {
    registerStoreActions(gateway, clock);
  }

  // ---------------------------------------------------------------- Catalog

  async catalog(): Promise<
    Array<{
      id: string;
      slug: string;
      kind: string;
      name: Localized;
      summary: Localized;
      features: Localized[];
      is_test: boolean;
      variants: Array<Record<string, unknown>>;
    }>
  > {
    return this.db.query(
      `select p.id, p.slug, p.kind, p.name, p.summary, p.features, p.is_test,
         coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'name', v.name, 'summary', v.summary, 'includes', v.includes,
                     'price_minor', v.price_minor, 'currency', v.currency, 'support_days', v.support_days) order by v.sort)
                   from product_variants v where v.product_id = p.id and v.active), '[]'::jsonb) as variants
       from products p where p.status = 'published' and ($1 or not p.is_test) order by p.is_test, p.created_at`,
      [this.options.allowTestProducts],
    );
  }

  /** Every product for the owner, drafts included, with its status, so the owner can publish one. */
  async products(): Promise<Array<Record<string, unknown>>> {
    return this.db.query(
      `select p.id, p.slug, p.kind, p.name, p.status, p.is_test, p.published_at,
         coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'name', v.name, 'price_minor', v.price_minor,
                     'currency', v.currency, 'unit_cost_minor', v.unit_cost_minor) order by v.sort)
                   from product_variants v where v.product_id = p.id and v.active), '[]'::jsonb) as variants
       from products p where ($1 or not p.is_test) order by p.is_test, p.created_at`,
      [this.options.allowTestProducts],
    );
  }

  // ---------------------------------------------------------------- Checkout

  /** Creates an order that waits for payment. The same idempotency key always returns the same order. */
  async createCheckout(raw: CheckoutInput): Promise<{ order: OrderRow; session: string; duplicate: boolean }> {
    const input = parseOrRefuse(checkoutInput, raw, 'The order is not complete.');
    const existing = maybeOne(
      await this.db.query<OrderRow>('select * from orders where idempotency_key = $1', [input.idempotencyKey]),
    );
    if (existing) return { order: existing, session: existing.checkout_session ?? '', duplicate: true };

    if (await activePause(this.db, [{ scope: 'orders' }]))
      throw new AppError('paused', 'The store is not taking orders right now.', 503);

    const lines = await this.orderLines(input.items);
    const first = checkOneOrder(lines, input.shippingAddress);
    for (const line of lines) {
      if (await activePause(this.db, [{ scope: 'product', target: line.variant.product_id }]))
        throw new AppError('paused', `${line.variant.sku} is not on sale right now.`, 503);
    }
    const total = lines.reduce((sum, line) => sum + line.variant.price_minor * line.quantity, 0);
    const session = `cs_${randomToken(12)}`;
    const order = await this.db.tx((tx) =>
      insertOrder(tx, input, { lines, currency: first.currency, total, session }, this.clock()),
    );
    return { order, session, duplicate: false };
  }

  /** Each item with its variant, when that variant is on sale, in stock, and (for a license) bought one at a time. */
  private async orderLines(items: CheckoutItem[]): Promise<OrderLine[]> {
    const variants = await this.db.query<VariantRow>(
      `select v.id, v.product_id, v.sku, v.name, v.price_minor, v.currency, v.unit_cost_minor, v.support_days, v.license_kind, v.stock,
              p.name as product_name, p.kind, p.status as product_status, p.is_test, p.supplier_id, p.delivery_days
       from product_variants v join products p on p.id = v.product_id where v.sku = any($1::text[]) and v.active`,
      [items.map((item) => item.sku)],
    );
    return items.map((item) => {
      const variant = variants.find((v) => v.sku === item.sku);
      if (!variant || variant.product_status !== 'published' || (variant.is_test && !this.options.allowTestProducts))
        throw invalid(`${item.sku} is not available.`);
      if (variant.kind === 'digital' && item.quantity !== 1) throw invalid('A license is sold one at a time.');
      if (variant.stock !== null && variant.stock < item.quantity) throw invalid(`${item.sku} is out of stock.`);
      return { variant, quantity: item.quantity };
    });
  }

  // ---------------------------------------------------------------- Orders

  private move(
    db: Db,
    order: OrderRow,
    to: OrderStatus,
    actor: Actor,
    data: Record<string, unknown> = {},
  ): Promise<OrderRow> {
    return moveOrder(db, order, to, actor, this.clock(), data);
  }

  async order(id: string): Promise<OrderRow & { items: OrderItemRow[] }> {
    const order = maybeOne(await this.db.query<OrderRow>('select * from orders where id = $1', [id]));
    if (!order) throw notFound('order');
    return {
      ...order,
      items: await this.db.query<OrderItemRow>('select * from order_items where order_id = $1', [id]),
    };
  }

  async orders(): Promise<OrderRow[]> {
    return this.db.query<OrderRow>('select * from orders order by created_at desc limit 200');
  }

  /** What a buyer may see about their own order: they must know both its number and the email it was placed with. */
  async publicStatus(
    number: string,
    email: string,
  ): Promise<{
    number: string;
    status: OrderStatus;
    total_minor: number;
    currency: string;
    items: Array<{ title: Localized; quantity: number }>;
    created_at: Date;
  } | null> {
    const order = maybeOne(
      await this.db.query<OrderRow>('select * from orders where number = $1 and lower(buyer_email) = lower($2)', [
        number,
        email,
      ]),
    );
    if (!order) return null;
    const items = await this.db.query<{ title: Localized; quantity: number }>(
      'select title, quantity from order_items where order_id = $1',
      [order.id],
    );
    return {
      number: order.number,
      status: order.status,
      total_minor: order.total_minor,
      currency: order.currency,
      items,
      created_at: order.created_at,
    };
  }

  /** The owner releases a held order, and it carries on from where it stopped. */
  async release(orderId: string, by: Actor, isOwner: boolean): Promise<OrderRow> {
    if (!isOwner) throw forbidden('Only the owner can release a held order.');
    const order = await this.order(orderId);
    await this.move(this.db, order, 'paid', by, { released: true });
    await this.fulfil(orderId);
    return this.order(orderId);
  }

  // ---------------------------------------------------------------- Webhooks

  private verify(secret: string, rawBody: string, signature: string | null | undefined): z.infer<typeof providerEvent> {
    if (!signature || !sameSignature(signature, hmacSha256(secret, rawBody)))
      throw new AppError('bad_signature', 'The signature of this notice is not valid.', 401);
    const parsed = providerEvent.safeParse(JSON.parse(rawBody));
    if (!parsed.success) throw invalid('The notice is not in the expected form.');
    return parsed.data;
  }

  /**
   * A notice from the payment provider. The signature is checked first, each notice is processed once, and a payment
   * counts only because the provider says so here: the customer's browser proves nothing (blueprint 5.2).
   */
  async handlePaymentWebhook(
    rawBody: string,
    signature: string | null | undefined,
  ): Promise<{ duplicate: boolean; result: string }> {
    return this.processPaymentEvent(this.verify(this.options.webhookSecrets.payments, rawBody, signature));
  }

  /**
   * A payment notice whose signature a provider adapter has already checked, such as PayTabs' callback. Each notice is
   * processed once.
   */
  async processPaymentEvent(event: z.infer<typeof providerEvent>): Promise<{ duplicate: boolean; result: string }> {
    const outcome = await this.db.tx(async (tx) => {
      const fresh = await tx.query(
        `insert into webhook_events (connector, external_id, event_type, signature_ok, payload) values ('payments', $1, $2, true, $3::jsonb)
         on conflict (connector, external_id) do nothing returning id`,
        [event.id, event.type, json(event.data)],
      );
      if (!fresh[0]) return { duplicate: true, result: 'already_processed', fulfil: null as string | null };
      let result = 'ignored';
      let fulfil: string | null = null;
      if (event.type === 'payment.captured') ({ result, fulfil } = await this.onCaptured(tx, event.data));
      else if (event.type === 'payment.settled') result = await this.onSettled(tx, event.data);
      else if (event.type === 'dispute.opened') result = await this.onDispute(tx, event.data);
      await tx.query(
        `update webhook_events set processed_at = now(), result = $3 where connector = 'payments' and external_id = $1 and event_type = $2`,
        [event.id, event.type, result],
      );
      return { duplicate: false, result, fulfil };
    });
    if (outcome.fulfil) await this.fulfil(outcome.fulfil);
    return { duplicate: outcome.duplicate, result: outcome.result };
  }

  private async onCaptured(tx: Db, data: Record<string, unknown>): Promise<{ result: string; fulfil: string | null }> {
    const shape = z
      .object({
        session: z.string(),
        payment_ref: z.string(),
        amount_minor: z.number().int().nonnegative(),
        currency: z.string(),
        provider: z.string().max(40).optional(),
      })
      .safeParse(data);
    if (!shape.success) return { result: 'malformed', fulfil: null };
    const { session, payment_ref, amount_minor, currency } = shape.data;
    const provider = shape.data.provider ?? 'mock';
    const order = maybeOne(
      await tx.query<OrderRow>('select * from orders where checkout_session = $1 for update', [session]),
    );
    if (!order) {
      await tx.query(
        `insert into security_alerts (severity, kind, summary, detail) values ('warning', 'unknown_payment', 'A payment arrived for a checkout the platform does not know.', $1::jsonb)`,
        [json({ session, payment_ref })],
      );
      return { result: 'unknown_session', fulfil: null };
    }
    if (order.status !== 'pending_payment') return { result: 'order_already_paid', fulfil: null };

    const now = this.clock();
    await tx.query(
      `insert into payments (order_id, provider, provider_ref, status, amount_minor, currency, captured_at) values ($1, $6, $2, 'pending', $3, $4, $5)
       on conflict (provider, provider_ref) do nothing`,
      [order.id, payment_ref, amount_minor, currency, now, provider],
    );
    const paid = await this.move(tx, order, 'paid', SYSTEM, { payment_ref, amount_minor, currency });
    await bookCapture(tx, order, amount_minor, currency, now);

    if (amount_minor !== order.total_minor || currency !== order.currency) {
      await this.move(tx, paid, 'on_hold', SYSTEM, {
        reason: 'amount_mismatch',
        expected_minor: order.total_minor,
        received_minor: amount_minor,
      });
      await tx.query(
        `insert into security_alerts (severity, kind, summary, detail) values ('critical', 'amount_mismatch', $1, $2::jsonb)`,
        [
          `Order ${order.number} was paid ${formatMoney(amount_minor, currency)} instead of ${formatMoney(order.total_minor, order.currency)}.`,
          json({ order_id: order.id }),
        ],
      );
      return { result: 'held_amount_mismatch', fulfil: null };
    }
    const cap = (await getPolicy(tx, 'orders.max_value_minor'))[currency] ?? null;
    if (cap !== null && amount_minor > cap) {
      await this.move(tx, paid, 'on_hold', SYSTEM, { reason: 'over_maximum_order_value' });
      return { result: 'held_for_review', fulfil: null };
    }
    if (await fulfilmentPaused(tx, order.id)) {
      await this.move(tx, paid, 'on_hold', SYSTEM, { reason: 'fulfillment_paused' });
      return { result: 'held_paused', fulfil: null };
    }
    return { result: 'paid', fulfil: order.id };
  }

  private async onSettled(tx: Db, data: Record<string, unknown>): Promise<string> {
    const shape = z.object({ payment_ref: z.string(), fee_minor: z.number().int().nonnegative() }).safeParse(data);
    if (!shape.success) return 'malformed';
    const payment = maybeOne(
      await tx.query<PaymentRow>(`select * from payments where provider_ref = $1 for update`, [shape.data.payment_ref]),
    );
    if (!payment) return 'unknown_payment';
    if (payment.status !== 'pending') return 'already_settled';
    const now = this.clock();
    await tx.query(`update payments set status = 'settled', fee_minor = $2, settled_at = $3 where id = $1`, [
      payment.id,
      shape.data.fee_minor,
      now,
    ]);
    const net = payment.amount_minor - payment.refunded_minor;
    await post(
      tx,
      [
        {
          engine: 'commerce',
          account: 'pending_revenue',
          amountMinor: -net,
          currency: payment.currency,
          refType: 'payment',
          refId: payment.id,
          memo: 'Cleared',
        },
        {
          engine: 'commerce',
          account: 'settled_revenue',
          amountMinor: net,
          currency: payment.currency,
          refType: 'payment',
          refId: payment.id,
          memo: 'Cleared into the balance',
        },
        {
          engine: 'commerce',
          account: 'payment_fees',
          amountMinor: shape.data.fee_minor,
          currency: payment.currency,
          refType: 'payment',
          refId: payment.id,
          memo: 'Provider fee',
        },
      ],
      now,
    );
    await audit(tx, {
      actor: SYSTEM,
      type: 'payment.settled',
      subject: { type: 'order', id: payment.order_id },
      data: {
        payment_ref: payment.provider_ref,
        amount_minor: net,
        fee_minor: shape.data.fee_minor,
        currency: payment.currency,
      },
    });
    return 'settled';
  }

  private async onDispute(tx: Db, data: Record<string, unknown>): Promise<string> {
    const shape = z
      .object({ payment_ref: z.string(), dispute_ref: z.string(), reason: z.string().optional() })
      .safeParse(data);
    if (!shape.success) return 'malformed';
    const payment = maybeOne(
      await tx.query<PaymentRow>('select * from payments where provider_ref = $1', [shape.data.payment_ref]),
    );
    if (!payment) return 'unknown_payment';
    await tx.query(
      `insert into disputes (order_id, payment_id, provider_ref, reason, opened_at) values ($1, $2, $3, $4, $5) on conflict (provider_ref) do nothing`,
      [payment.order_id, payment.id, shape.data.dispute_ref, shape.data.reason ?? null, this.clock()],
    );
    await tx.query('update orders set disputed = true where id = $1', [payment.order_id]);
    await tx.query(
      `insert into security_alerts (severity, kind, summary, detail) values ('critical', 'dispute_opened', 'A customer opened a dispute. The order is frozen until the provider decides.', $1::jsonb)`,
      [json({ order_id: payment.order_id, dispute_ref: shape.data.dispute_ref })],
    );
    await audit(tx, {
      actor: SYSTEM,
      type: 'order.disputed',
      subject: { type: 'order', id: payment.order_id },
      data: { dispute_ref: shape.data.dispute_ref },
    });
    return 'dispute_recorded';
  }

  /** A notice from the supplier about a shipment. */
  async handleSupplierWebhook(
    rawBody: string,
    signature: string | null | undefined,
  ): Promise<{ duplicate: boolean; result: string }> {
    const event = this.verify(this.options.webhookSecrets.supplier, rawBody, signature);
    const outcome = await this.db.tx(async (tx) => {
      const fresh = await tx.query(
        `insert into webhook_events (connector, external_id, event_type, signature_ok, payload) values ('supplier', $1, $2, true, $3::jsonb)
         on conflict (connector, external_id) do nothing returning id`,
        [event.id, event.type, json(event.data)],
      );
      if (!fresh[0]) return { duplicate: true, result: 'already_processed' };
      const shape = z
        .object({ supplier_ref: z.string(), status: z.enum(['shipped', 'delivered']), tracking: z.string().optional() })
        .safeParse(event.data);
      if (event.type !== 'shipment.updated' || !shape.success) return { duplicate: false, result: 'ignored' };
      const shipment = maybeOne(
        await tx.query<{ id: string; order_id: string; status: string }>(
          'select id, order_id, status from shipments where supplier_ref = $1 for update',
          [shape.data.supplier_ref],
        ),
      );
      if (!shipment) return { duplicate: false, result: 'unknown_shipment' };
      await tx.query('update shipments set status = $2, tracking = coalesce($3, tracking) where id = $1', [
        shipment.id,
        shape.data.status,
        shape.data.tracking ?? null,
      ]);
      const order = one(await tx.query<OrderRow>('select * from orders where id = $1 for update', [shipment.order_id]));
      if (shape.data.status === 'shipped' && order.status === 'fulfilling')
        await this.move(tx, order, 'shipped', SYSTEM, { tracking: shape.data.tracking ?? null });
      if (shape.data.status === 'delivered' && (order.status === 'shipped' || order.status === 'fulfilling'))
        await this.move(tx, order, 'delivered', SYSTEM, {});
      return { duplicate: false, result: shape.data.status };
    });
    return outcome;
  }

  // ---------------------------------------------------------------- Fulfillment

  /** Carries a paid order forward. Safe to call again: every step it takes is tied to an idempotency key. */
  async fulfil(orderId: string): Promise<void> {
    const order = await this.order(orderId);
    if (order.status !== 'paid') return;
    try {
      if (order.items.every((item) => item.kind === 'digital')) await this.deliverLicenses(order);
      else await this.orderFromSupplier(order);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const current = await this.order(orderId);
      if (current.status === 'paid' || current.status === 'fulfilling')
        await this.move(this.db, current, 'on_hold', SYSTEM, { reason: `fulfillment_failed: ${reason}` });
      await this.db.query(
        `insert into security_alerts (severity, kind, summary, detail) values ('critical', 'fulfillment_failed', $1, $2::jsonb)`,
        [`Order ${order.number} is paid but could not be fulfilled.`, json({ order_id: order.id, reason })],
      );
    }
  }

  private async deliverLicenses(order: OrderRow & { items: OrderItemRow[] }): Promise<void> {
    const now = this.clock();
    const lines: string[] = [];
    let supportUntil: Date | null = null;
    for (const item of order.items) {
      const variant = one(
        await this.db.query<{ support_days: number; license_kind: string | null }>(
          'select support_days, license_kind from product_variants where id = $1',
          [item.variant_id],
        ),
      );
      const until = variant.support_days > 0 ? new Date(now.getTime() + variant.support_days * 86_400_000) : null;
      const license = one(
        await this.db.query<{ license_key: string; support_until: Date | null }>(
          `insert into licenses (order_item_id, license_key, kind, holder_name, holder_email, issued_at, support_until) values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (order_item_id) do update set holder_name = excluded.holder_name returning license_key, support_until`,
          [
            item.id,
            `ZL-${randomToken(2)}-${randomToken(2)}-${randomToken(2)}`.toUpperCase(),
            variant.license_kind ?? 'standard',
            order.buyer_name,
            order.buyer_email,
            now,
            until,
          ],
        ),
      );
      lines.push(`${pick(item.title, order.locale)}: ${license.license_key}`);
      supportUntil = license.support_until ?? supportUntil;
    }
    const never = order.locale === 'ar' ? 'غير مشمول' : 'not included';
    const text = await renderTemplate(this.db, 'license-delivery', order.locale, {
      name: order.buyer_name,
      order_number: order.number,
      licenses: lines.join('\n'),
      support_until: supportUntil ? supportUntil.toISOString().slice(0, 10) : never,
    });
    await this.move(this.db, order, 'fulfilling', FULFILLMENT, {});
    await this.gateway.propose({
      type: 'gmail.send_email',
      payload: {
        to: order.buyer_email,
        subject: text.subject,
        body: text.body,
        locale: order.locale,
        template: 'license-delivery',
        order_id: order.id,
      },
      requester: FULFILLMENT,
      idempotencyKey: `license-delivery:${order.id}`,
      evidence: [
        {
          kind: 'order',
          number: order.number,
          total: formatMoney(order.total_minor, order.currency),
          paid_at: order.paid_at,
        },
      ],
    });
  }

  private async orderFromSupplier(order: OrderRow & { items: OrderItemRow[] }): Promise<void> {
    const product = one(
      await this.db.query<{ supplier_id: string | null; supplier_name: string | null; supplier_status: string | null }>(
        `select p.supplier_id, s.name as supplier_name, s.status as supplier_status from product_variants v join products p on p.id = v.product_id
         left join suppliers s on s.id = p.supplier_id where v.id = $1`,
        [order.items[0]!.variant_id],
      ),
    );
    if (!product.supplier_id || product.supplier_status !== 'approved')
      throw new Error('no approved supplier for this product');
    const cost = order.items.reduce((sum, item) => sum + item.unit_cost_minor * item.quantity, 0);
    const existing = maybeOne(
      await this.db.query<{ id: string }>('select id from shipments where order_id = $1', [order.id]),
    );
    const shipment =
      existing ??
      one(
        await this.db.query<{ id: string }>(
          `insert into shipments (order_id, supplier_id, cost_minor, currency) values ($1, $2, $3, $4) returning id`,
          [order.id, product.supplier_id, cost, order.currency],
        ),
      );
    const skus = await this.db.query<{ sku: string; quantity: number }>(
      'select v.sku, i.quantity from order_items i join product_variants v on v.id = i.variant_id where i.order_id = $1',
      [order.id],
    );
    await this.gateway.propose({
      type: 'supplier.place_order',
      payload: {
        amount_minor: cost,
        currency: order.currency,
        shipment_id: shipment.id,
        order_id: order.id,
        supplier_id: product.supplier_id,
        supplier_name: product.supplier_name,
        items: skus,
        ship_to: `${order.buyer_name}, ${order.shipping_address ?? ''}`,
      },
      requester: FULFILLMENT,
      idempotencyKey: `supplier-order:${shipment.id}`,
      evidence: [
        {
          kind: 'order',
          number: order.number,
          total: formatMoney(order.total_minor, order.currency),
          paid_at: order.paid_at,
        },
      ],
    });
  }

  // ---------------------------------------------------------------- Refunds

  /** Prepares a refund for the owner to approve. A refund is Level 3: it never happens on its own. */
  async proposeRefund(
    orderId: string,
    input: { amountMinor?: number; reason: string },
    requester: Actor,
  ): Promise<{ refundId: string; action: ActionRow }> {
    const order = await this.order(orderId);
    const payment = maybeOne(
      await this.db.query<PaymentRow>(`select * from payments where order_id = $1 order by captured_at desc limit 1`, [
        orderId,
      ]),
    );
    if (!payment) throw invalid('This order has no payment to refund.');
    const refundable = payment.amount_minor - payment.refunded_minor;
    const amount = input.amountMinor ?? refundable;
    if (!(Number.isInteger(amount) && amount > 0 && amount <= refundable))
      throw invalid(`At most ${formatMoney(refundable, payment.currency)} can be refunded on this order.`);
    const refund = one(
      await this.db.query<{ id: string }>(
        `insert into refunds (order_id, payment_id, amount_minor, currency, reason) values ($1, $2, $3, $4, $5) returning id`,
        [orderId, payment.id, amount, payment.currency, input.reason],
      ),
    );
    const { action } = await this.gateway.propose({
      type: 'payments.refund',
      payload: {
        amount_minor: amount,
        currency: payment.currency,
        refund_id: refund.id,
        order_id: orderId,
        payment_ref: payment.provider_ref,
        to: order.buyer_email,
        reason: input.reason,
      },
      requester,
      idempotencyKey: `refund:${refund.id}`,
      evidence: [
        {
          kind: 'order',
          number: order.number,
          status: order.status,
          total: formatMoney(order.total_minor, order.currency),
          paid_at: order.paid_at,
          already_refunded: formatMoney(payment.refunded_minor, payment.currency),
        },
      ],
    });
    await this.db.query('update refunds set action_id = $2 where id = $1', [refund.id, action.id]);
    return { refundId: refund.id, action };
  }
}

type CheckoutItem = { sku: string; quantity: number };
type OrderLine = { variant: VariantRow; quantity: number };

/** One order holds one currency and one kind of product, and a physical one has somewhere to go. Returns its first variant. */
function checkOneOrder(lines: OrderLine[], shippingAddress: string | undefined): VariantRow {
  const first = lines[0]!.variant;
  if (lines.some((line) => line.variant.currency !== first.currency))
    throw invalid('All items in one order must be in the same currency.');
  if (lines.some((line) => line.variant.kind !== first.kind))
    throw invalid('Digital and physical products are ordered separately.');
  if (first.kind === 'physical' && !shippingAddress) throw invalid('A delivery address is needed for this order.');
  return first;
}

/** Writes the order and its items, waiting for payment, and records it in the audit log. */
async function insertOrder(
  tx: Db,
  input: z.output<typeof checkoutInput>,
  order: { lines: OrderLine[]; currency: string; total: number; session: string },
  now: Date,
): Promise<OrderRow> {
  const created = one(
    await tx.query<OrderRow>(
      `insert into orders (idempotency_key, buyer_name, buyer_email, locale, shipping_address, currency, total_minor, checkout_session, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [
        input.idempotencyKey,
        input.buyer.name,
        input.buyer.email,
        input.locale,
        input.shippingAddress ?? null,
        order.currency,
        order.total,
        order.session,
        now,
      ],
    ),
  );
  for (const line of order.lines) {
    const title: Localized = {
      en: `${line.variant.product_name.en}: ${line.variant.name.en}`,
      ar: `${line.variant.product_name.ar}: ${line.variant.name.ar}`,
    };
    await tx.query(
      `insert into order_items (order_id, variant_id, title, kind, quantity, unit_price_minor, unit_cost_minor) values ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
      [
        created.id,
        line.variant.id,
        json(title),
        line.variant.kind,
        line.quantity,
        line.variant.price_minor,
        line.variant.unit_cost_minor,
      ],
    );
  }
  await audit(tx, {
    actor: SYSTEM,
    type: 'order.created',
    subject: { type: 'order', id: created.id },
    data: {
      number: created.number,
      total_minor: order.total,
      currency: order.currency,
      skus: input.items.map((i) => i.sku),
    },
  });
  return created;
}

/** A captured payment is revenue not yet cleared, and a physical order owes its supplier the cost of goods. */
async function bookCapture(tx: Db, order: OrderRow, amountMinor: number, currency: string, now: Date): Promise<void> {
  const ref = { type: 'order', id: order.id };
  const items = await tx.query<OrderItemRow>('select * from order_items where order_id = $1', [order.id]);
  const owed = items
    .filter((item) => item.kind === 'physical')
    .reduce((sum, item) => sum + item.unit_cost_minor * item.quantity, 0);
  const postings: Posting[] = [
    storePosting('gross_revenue', amountMinor, currency, ref, `Order ${order.number}`),
    storePosting('pending_revenue', amountMinor, currency, ref, 'Taken by the provider, not yet cleared'),
  ];
  if (owed > 0)
    postings.push(storePosting('supplier_obligations', owed, currency, ref, 'Owed to the supplier for this order'));
  await post(tx, postings, now);
}

/** True while fulfilment, or any product in the order, is paused. */
async function fulfilmentPaused(tx: Db, orderId: string): Promise<boolean> {
  const products = await tx.query<{ product_id: string }>(
    'select distinct v.product_id from order_items i join product_variants v on v.id = i.variant_id where i.order_id = $1',
    [orderId],
  );
  const targets = [
    { scope: 'fulfillment' as const },
    ...products.map((row) => ({ scope: 'product' as const, target: row.product_id })),
  ];
  return (await activePause(tx, targets)) !== null;
}
