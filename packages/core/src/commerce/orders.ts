import type { Account, Posting } from '../finance/ledger';
import { audit } from '../governance/audit';
import { getPolicy } from '../governance/settings';
import { type Db, maybeOne, one } from '../lib/db';
import { conflict } from '../lib/errors';
import type { Actor, Locale, Localized } from '../lib/types';

/** The rows of an order and its money, and the rules for moving an order from one state to the next. */

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'on_hold'
  | 'fulfilling'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'return_requested'
  | 'canceled'
  | 'refunded'
  | 'expired';

export interface OrderRow {
  id: string;
  number: string;
  idempotency_key: string;
  buyer_name: string;
  buyer_email: string;
  locale: Locale;
  shipping_address: string | null;
  status: OrderStatus;
  hold_reason: string | null;
  disputed: boolean;
  currency: string;
  total_minor: number;
  checkout_session: string | null;
  created_at: Date;
  paid_at: Date | null;
  delivered_at: Date | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  variant_id: string;
  title: Localized;
  kind: 'digital' | 'physical';
  quantity: number;
  unit_price_minor: number;
  unit_cost_minor: number;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string;
  status: 'pending' | 'settled' | 'failed' | 'refunded' | 'partially_refunded';
  amount_minor: number;
  fee_minor: number;
  refunded_minor: number;
  currency: string;
}

export interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  name: Localized;
  price_minor: number;
  currency: string;
  unit_cost_minor: number;
  support_days: number;
  license_kind: string | null;
  stock: number | null;
  product_name: Localized;
  kind: 'digital' | 'physical';
  product_status: string;
  is_test: boolean;
  supplier_id: string | null;
  delivery_days: number | null;
}

/** The order states of blueprint 5.2. A state can move only along these lines. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'expired'],
  paid: ['on_hold', 'fulfilling', 'canceled', 'refunded'],
  on_hold: ['paid', 'canceled', 'refunded'],
  fulfilling: ['shipped', 'delivered', 'on_hold', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['completed', 'return_requested', 'refunded'],
  return_requested: ['refunded', 'completed'],
  completed: ['refunded'],
  canceled: ['refunded'],
  refunded: [],
  expired: [],
};

/** Who moves an order along once it is paid. */
export const FULFILLMENT: Actor = { kind: 'automation', id: 'fulfillment' };

/** Moves [order] to [to], only along the lines of [TRANSITIONS], and records who did it. */
export async function moveOrder(
  db: Db,
  order: OrderRow,
  to: OrderStatus,
  actor: Actor,
  now: Date,
  data: Record<string, unknown> = {},
): Promise<OrderRow> {
  if (!TRANSITIONS[order.status].includes(to)) throw conflict(`an order cannot move from ${order.status} to ${to}`);
  const moved = one(
    await db.query<OrderRow>(
      `update orders set status = $2, hold_reason = $3, paid_at = case when $2 = 'paid' and paid_at is null then $4 else paid_at end,
         delivered_at = case when $2 = 'delivered' then $4 else delivered_at end where id = $1 returning *`,
      [order.id, to, to === 'on_hold' ? String(data.reason ?? '') : null, now],
    ),
  );
  await audit(db, {
    actor,
    type: `order.${to}`,
    subject: { type: 'order', id: order.id },
    data: { number: order.number, from: order.status, ...data },
  });
  return moved;
}

/** The order, locked for this transaction. Throws when there is none. */
export async function lockedOrder(db: Db, id: unknown): Promise<OrderRow> {
  return one(await db.query<OrderRow>('select * from orders where id = $1 for update', [id]));
}

/** The order, locked for this transaction, or null when there is none. */
export async function lockOrder(db: Db, id: unknown): Promise<OrderRow | null> {
  return maybeOne(await db.query<OrderRow>('select * from orders where id = $1 for update', [id]));
}

/** One line in the books for the store, about [refType] [refId]. */
export function storePosting(
  account: Account,
  amountMinor: number,
  currency: string,
  ref: { type: string; id: string },
  memo: string,
): Posting {
  return { engine: 'commerce', account, amountMinor, currency, refType: ref.type, refId: ref.id, memo };
}

/** What one unit costs the company in [currency] besides its own cost: payment fees, advertising and refunds. */
export async function costPricing(
  db: Db,
  currency: string,
  unitCostMinor: number,
): Promise<{
  unitCostMinor: number;
  fixedFeeMinor: number;
  feeBps: number;
  advertisingBps: number;
  refundBps: number;
}> {
  return {
    unitCostMinor,
    fixedFeeMinor: (await getPolicy(db, 'pricing.payment_fee_fixed_minor'))[currency] ?? 0,
    feeBps: await getPolicy(db, 'pricing.payment_fee_bps'),
    advertisingBps: await getPolicy(db, 'pricing.advertising_bps'),
    refundBps: await getPolicy(db, 'pricing.refund_allowance_bps'),
  };
}
