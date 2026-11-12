import type { Db } from '../lib/db';
import { assertMinor, shareOf } from '../lib/money';
import { getPolicy } from '../governance/settings';

export type Engine = 'commerce' | 'services' | 'company';
export type Account =
  | 'gross_revenue' | 'pending_revenue' | 'settled_revenue'
  | 'product_cost' | 'service_delivery_cost' | 'advertising_cost' | 'payment_fees'
  | 'refunds' | 'chargebacks' | 'supplier_obligations' | 'tax_collected' | 'operating_costs';

export interface Posting {
  engine: Engine;
  account: Account;
  /** Signed. A positive amount adds to the account. */
  amountMinor: number;
  currency: string;
  refType: string;
  refId: string;
  memo?: string;
}

/** Appends postings to the ledger. The ledger is append-only: a correction is a new posting. */
export async function post(db: Db, postings: Posting[], at: Date): Promise<void> {
  for (const p of postings) {
    if (assertMinor(p.amountMinor) === 0) continue;
    await db.query(
      `insert into ledger_entries (at, engine, account, amount_minor, currency, ref_type, ref_id, memo) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [at, p.engine, p.account, p.amountMinor, p.currency, p.refType, p.refId, p.memo ?? ''],
    );
  }
}

type Totals = Record<Account, number>;
const ZERO: Totals = {
  gross_revenue: 0, pending_revenue: 0, settled_revenue: 0, product_cost: 0, service_delivery_cost: 0, advertising_cost: 0,
  payment_fees: 0, refunds: 0, chargebacks: 0, supplier_obligations: 0, tax_collected: 0, operating_costs: 0,
};

export type SpendStatus = 'not_safe_to_spend' | 'limited_reinvestment_available' | 'safe_to_consider_upgrade';

export interface MoneySummary {
  currency: string;
  /** The separate books of each engine (blueprint 6.3). */
  engines: Record<'commerce' | 'services', Totals>;
  /** The cash waterfall for the whole company (blueprint 6.4). */
  waterfall: {
    settled_balance: number;
    supplier_obligations: number;
    taxes: number;
    refund_and_dispute_reserve: number;
    available_cash: number;
    operating_costs_and_buffer: number;
    confirmed_net_profit: number;
    reinvestment_share_bps: number;
    approved_reinvestment_budget: number;
  };
  pending_revenue: number;
  open_disputes: number;
  status: SpendStatus;
  /** Why the status is what it is, in fixed codes the dashboard translates. */
  reasons: string[];
  as_of: string;
}

async function totals(db: Db, currency: string, where = '', params: unknown[] = []): Promise<Record<string, Totals>> {
  const rows = await db.query<{ engine: string; account: Account; total: number }>(
    `select engine, account, sum(amount_minor)::bigint as total from ledger_entries where currency = $1 ${where} group by engine, account`,
    [currency, ...params],
  );
  const out: Record<string, Totals> = { commerce: { ...ZERO }, services: { ...ZERO }, company: { ...ZERO } };
  for (const row of rows) out[row.engine]![row.account] = row.total;
  return out;
}

const balanceOf = (t: Totals): number =>
  t.settled_revenue - t.payment_fees - t.refunds - t.chargebacks - t.product_cost - t.service_delivery_cost - t.advertising_cost - t.operating_costs;

/**
 * What money the company really has in one currency. Every figure is calculated here, from the ledger, and never
 * estimated (blueprint 6.3 to 6.5). A sale is not a payment, a pending payment is not settled, and settled money is
 * not profit until obligations and reserves are covered.
 */
export async function moneySummary(db: Db, currency: string, now: Date): Promise<MoneySummary> {
  const all = await totals(db, currency);
  const windowDays = await getPolicy(db, 'reserve.window_days');
  const recent = await totals(db, currency, 'and at > $2', [new Date(now.getTime() - windowDays * 86_400_000)]);
  const reserve =
    shareOf(Math.max(0, recent.commerce!.settled_revenue), await getPolicy(db, 'reserve.product_bps')) +
    shareOf(Math.max(0, recent.services!.settled_revenue), await getPolicy(db, 'reserve.service_bps'));

  const sum = (pick: (t: Totals) => number): number => pick(all.commerce!) + pick(all.services!) + pick(all.company!);
  const settledBalance = sum(balanceOf);
  const obligations = sum((t) => t.supplier_obligations);
  const taxes = sum((t) => t.tax_collected);
  const pending = sum((t) => t.pending_revenue);
  const settled = sum((t) => t.settled_revenue);
  const available = settledBalance - obligations - taxes - reserve;

  const fixed = (await getPolicy(db, 'buffer.monthly_fixed_costs_minor'))[currency] ?? 0;
  const hold = fixed * (await getPolicy(db, 'buffer.months'));
  const profit = available - hold;
  const shareBps = await getPolicy(db, 'reinvestment.share_bps');
  const budget = profit > 0 ? shareOf(profit, shareBps) : 0;
  const disputes = (await db.query<{ n: number }>(`select count(*)::int as n from disputes d join payments p on p.id = d.payment_id where d.status = 'open' and p.currency = $1`, [currency]))[0]!.n;

  const reasons: string[] = [];
  if (pending > 0 && settled === 0) reasons.push('revenue_pending');
  if (settledBalance - obligations < 0) reasons.push('obligations_exceed_funds');
  if (settledBalance - obligations - taxes < reserve) reasons.push('reserves_insufficient');
  if (available > 0 && profit <= 0) reasons.push('buffer_not_full');
  if (settled === 0 && pending === 0) reasons.push('no_revenue');
  let status: SpendStatus = 'not_safe_to_spend';
  if (budget > 0) {
    const uncertain = pending > 0 || disputes > 0;
    status = uncertain ? 'limited_reinvestment_available' : 'safe_to_consider_upgrade';
    if (pending > 0) reasons.push('some_revenue_pending');
    if (disputes > 0) reasons.push('open_disputes');
  }

  return {
    currency,
    engines: { commerce: all.commerce!, services: all.services! },
    waterfall: {
      settled_balance: settledBalance,
      supplier_obligations: obligations,
      taxes,
      refund_and_dispute_reserve: reserve,
      available_cash: available,
      operating_costs_and_buffer: hold,
      confirmed_net_profit: profit,
      reinvestment_share_bps: shareBps,
      approved_reinvestment_budget: budget,
    },
    pending_revenue: pending,
    open_disputes: disputes,
    status,
    reasons,
    as_of: now.toISOString(),
  };
}

/** Currencies that have any posting, so that the dashboard shows one summary per currency. */
export async function ledgerCurrencies(db: Db): Promise<string[]> {
  return (await db.query<{ currency: string }>('select distinct currency from ledger_entries order by currency')).map((r) => r.currency);
}
