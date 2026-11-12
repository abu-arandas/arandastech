import { type Db, json } from '../lib/db';
import { invalid } from '../lib/errors';
import type { Actor } from '../lib/types';
import { audit } from './audit';

type PerCurrency = Record<string, number | null>;

/**
 * The owner policy sheet (blueprint 2.7). The values here are the suggested starting points; the owner replaces them.
 * A null means "not set yet": the platform then takes the careful path, for example by asking every time.
 */
export const POLICY_DEFAULTS = {
  'margin.min_product_bps': { value: 2000 as number, description: 'Minimum net margin for products, in basis points (2000 is 20%). Offers below it are blocked.' },
  'margin.min_service_bps': { value: 3000 as number, description: 'Minimum net margin for service packages after costing delivery time, in basis points.' },
  'services.delivery_rate_minor': { value: { JOD: null, USD: null } as PerCurrency, description: 'Hourly rate used to cost the owner\'s and contractors\' time, per currency. Not set until the owner sets it.' },
  'pricing.payment_fee_bps': { value: 0 as number, description: 'The payment provider\'s percentage fee, in basis points. Set it from the provider\'s real fee.' },
  'pricing.payment_fee_fixed_minor': { value: { JOD: 0, USD: 0 } as PerCurrency, description: 'The payment provider\'s fixed fee per payment, per currency.' },
  'pricing.advertising_bps': { value: 0 as number, description: 'Advertising cost as a share of the price, in basis points. Zero while advertising is off.' },
  'pricing.refund_allowance_bps': { value: 500 as number, description: 'Expected refunds and disputes as a share of the price, in basis points.' },
  'sales.max_discount_bps': { value: 1000 as number, description: 'Largest discount an agent may propose, in basis points.' },
  'orders.max_value_minor': { value: { JOD: null, USD: null } as PerCurrency, description: 'Orders above this value are held for manual review, per currency.' },
  'orders.review_first_n': { value: 20 as number, description: 'The first orders are listed for the owner to verify by hand.' },
  'shipping.max_delivery_days': { value: null as number | null, description: 'Longest delivery estimate a listed physical product may carry.' },
  'advertising.enabled': { value: false as boolean, description: 'Advertising is off until the owner turns it on.' },
  'refunds.rule_threshold_minor': { value: { JOD: null, USD: null } as PerCurrency, description: 'Refunds at or below this amount, and inside the published policy, may later run under a standing rule.' },
  'reserve.product_bps': { value: 1000 as number, description: 'Share of settled product revenue held as the refund and dispute reserve, in basis points.' },
  'reserve.service_bps': { value: 500 as number, description: 'Share of settled service revenue held as the refund and dispute reserve, in basis points.' },
  'reserve.window_days': { value: 90 as number, description: 'How many days of settled revenue the reserve is calculated on.' },
  'tax.reserve_bps': { value: null as number | null, description: 'Share of profit set aside for tax. Set it with the accountant.' },
  'buffer.months': { value: 3 as number, description: 'Months of fixed costs kept in available cash before any reinvestment.' },
  'buffer.monthly_fixed_costs_minor': { value: { JOD: 0, USD: 0 } as PerCurrency, description: 'Fixed monthly costs, per currency, used to size the operating buffer.' },
  'reinvestment.share_bps': { value: 5000 as number, description: 'Share of confirmed net profit that may be proposed for reinvestment, in basis points.' },
  'approvals.second_check_minor': { value: { JOD: null, USD: null } as PerCurrency, description: 'Amount at or above which a second check is required, per currency.' },
  'approvals.cooling_off_hours': { value: 24 as number, description: 'Until a second approver exists, how long a large amount waits before it can be approved.' },
  'approvals.expiry_hours': { value: 72 as number, description: 'How long an approval request waits before it lapses.' },
  'rules.max_lifetime_days': { value: 30 as number, description: 'Longest a standing rule runs before the owner renews it.' },
  'rules.allow_level_3': { value: false as boolean, description: 'Whether standing rules may cover Level 3 actions. Off during the early stages.' },
  'security.untrusted_window_minutes': { value: 60 as number, description: 'After an agent reads outside content, its proposals are treated as untrusted for this long.' },
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;
export type PolicyValue<K extends PolicyKey> = (typeof POLICY_DEFAULTS)[K]['value'];

/** Writes any default that is not in the database yet. Existing values are left alone. */
export async function seedPolicy(db: Db): Promise<void> {
  for (const [key, def] of Object.entries(POLICY_DEFAULTS)) {
    await db.query(
      `insert into policy_settings (key, value, description) values ($1, $2::jsonb, $3) on conflict (key) do nothing`,
      [key, json(def.value), def.description],
    );
  }
}

export async function getPolicy<K extends PolicyKey>(db: Db, key: K): Promise<PolicyValue<K>> {
  const rows = await db.query<{ value: PolicyValue<K> }>('select value from policy_settings where key = $1', [key]);
  return rows[0] ? rows[0].value : POLICY_DEFAULTS[key].value;
}

export async function listPolicy(db: Db): Promise<Array<{ key: string; value: unknown; description: string; updated_at: Date; updated_by: string }>> {
  return db.query('select key, value, description, updated_at, updated_by from policy_settings order by key');
}

/** Changes one number on the policy sheet. The caller has already checked that the actor is the owner. */
export async function setPolicy<K extends PolicyKey>(db: Db, key: K, value: PolicyValue<K>, by: Actor): Promise<void> {
  if (!(key in POLICY_DEFAULTS)) throw invalid(`unknown policy setting ${key}`);
  const expected = POLICY_DEFAULTS[key].value;
  const sameKind = value === null || expected === null || typeof value === typeof expected;
  if (!sameKind) throw invalid(`policy setting ${key} expects a ${typeof expected}`);
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw invalid(`policy setting ${key} cannot be negative`);
  await db.tx(async (tx) => {
    await tx.query(
      `insert into policy_settings (key, value, description, updated_by) values ($1, $2::jsonb, $3, $4)
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [key, json(value), POLICY_DEFAULTS[key].description, by.id ?? by.kind],
    );
    await audit(tx, { actor: by, type: 'policy.changed', subject: { type: 'policy_setting', id: key }, data: { value } });
  });
}
