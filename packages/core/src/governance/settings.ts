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
  'margin.min_product_bps': {
    value: 2000 as number,
    description: 'Minimum net margin for products, in basis points (2000 is 20%). Offers below it are blocked.',
  },
  'margin.min_service_bps': {
    value: 3000 as number,
    description: 'Minimum net margin for service packages after costing delivery time, in basis points.',
  },
  'services.delivery_rate_minor': {
    value: { JOD: null, USD: null } as PerCurrency,
    description:
      "Hourly rate used to cost the owner's and contractors' time, per currency. Not set until the owner sets it.",
  },
  'pricing.payment_fee_bps': {
    value: 0 as number,
    description: "The payment provider's percentage fee, in basis points. Set it from the provider's real fee.",
  },
  'pricing.payment_fee_fixed_minor': {
    value: { JOD: 0, USD: 0 } as PerCurrency,
    description: "The payment provider's fixed fee per payment, per currency.",
  },
  'pricing.advertising_bps': {
    value: 0 as number,
    description: 'Advertising cost as a share of the price, in basis points. Zero while advertising is off.',
  },
  'pricing.refund_allowance_bps': {
    value: 500 as number,
    description: 'Expected refunds and disputes as a share of the price, in basis points.',
  },
  'sales.max_discount_bps': {
    value: 1000 as number,
    description: 'Largest discount an agent may propose, in basis points.',
  },
  'orders.max_value_minor': {
    value: { JOD: null, USD: null } as PerCurrency,
    description: 'Orders above this value are held for manual review, per currency.',
  },
  'orders.review_first_n': {
    value: 20 as number,
    description: 'The first orders are listed for the owner to verify by hand.',
  },
  'shipping.max_delivery_days': {
    value: null as number | null,
    description: 'Longest delivery estimate a listed physical product may carry.',
  },
  'advertising.enabled': { value: false as boolean, description: 'Advertising is off until the owner turns it on.' },
  'refunds.rule_threshold_minor': {
    value: { JOD: null, USD: null } as PerCurrency,
    description:
      'Refunds at or below this amount, and inside the published policy, may later run under a standing rule.',
  },
  'reserve.product_bps': {
    value: 1000 as number,
    description: 'Share of settled product revenue held as the refund and dispute reserve, in basis points.',
  },
  'reserve.service_bps': {
    value: 500 as number,
    description: 'Share of settled service revenue held as the refund and dispute reserve, in basis points.',
  },
  'reserve.window_days': {
    value: 90 as number,
    description: 'How many days of settled revenue the reserve is calculated on.',
  },
  'tax.reserve_bps': {
    value: null as number | null,
    description: 'Share of profit set aside for tax. Set it with the accountant.',
  },
  'buffer.months': {
    value: 3 as number,
    description: 'Months of fixed costs kept in available cash before any reinvestment.',
  },
  'buffer.monthly_fixed_costs_minor': {
    value: { JOD: 0, USD: 0 } as PerCurrency,
    description: 'Fixed monthly costs, per currency, used to size the operating buffer.',
  },
  'reinvestment.share_bps': {
    value: 5000 as number,
    description: 'Share of confirmed net profit that may be proposed for reinvestment, in basis points.',
  },
  'approvals.second_check_minor': {
    value: { JOD: null, USD: null } as PerCurrency,
    description: 'Amount at or above which a second check is required, per currency.',
  },
  'approvals.cooling_off_hours': {
    value: 24 as number,
    description: 'Until a second approver exists, how long a large amount waits before it can be approved.',
  },
  'approvals.expiry_hours': {
    value: 72 as number,
    description: 'How long an approval request waits before it lapses.',
  },
  'rules.max_lifetime_days': {
    value: 30 as number,
    description: 'Longest a standing rule runs before the owner renews it.',
  },
  'rules.allow_level_3': {
    value: false as boolean,
    description: 'Whether standing rules may cover Level 3 actions. Off during the early stages.',
  },
  'security.untrusted_window_minutes': {
    value: 60 as number,
    description: 'After an agent reads outside content, its proposals are treated as untrusted for this long.',
  },
  'ai.enabled': {
    value: true as boolean,
    description:
      'Whether the departments may call the AI model when an API key is set. Off, or without a key, they work in manual mode at no cost.',
  },
  'ai.daily_cap_micros': {
    value: 1_000_000 as number,
    description:
      'Most the AI model may cost in one day, in millionths of a US dollar (1000000 is 1 dollar). At the cap the departments switch to manual mode.',
  },
  'ai.monthly_cap_micros': {
    value: 10_000_000 as number,
    description: 'Most the AI model may cost in one calendar month, in millionths of a US dollar.',
  },
  'ai.run_cap_micros': {
    value: 250_000 as number,
    description:
      'Most one department run may cost, in millionths of a US dollar. A run that reaches it stops and says so.',
  },
  'revenue.monthly_goal_minor': {
    value: { USD: 300_000 } as PerCurrency,
    description:
      'The revenue the company aims to collect each calendar month (Amman time), in US cents. 300000 is 3,000 US dollars.',
  },
  'revenue.average_deal_minor': {
    value: { USD: 100_000 } as PerCurrency,
    description:
      'The usual size of one won deal, in US cents, until the books have enough paid invoices to measure it.',
  },
  'sales.sender_name': {
    value: 'Ehab' as string,
    description: 'The name that signs the sales emails.',
  },
  'sales.booking_link': {
    value: '' as string,
    description:
      'The page where a lead books a call, for example a Google Calendar booking page (https://calendar.app.google/...). Empty: the emails ask for two times instead.',
  },
  'sales.showcase_link': {
    value: 'https://zirr-site.vercel.app' as string,
    description: 'The page the outreach emails point to, to show the work.',
  },
  'sales.daily_send_limit': {
    value: 15 as number,
    description:
      'Most sales emails proposed in one day across all sequences, so the mailbox stays trusted. New outreach stops at the limit; replies and invoices always go.',
  },
  'billing.deposit_bps': {
    value: 5000 as number,
    description: 'Share of a proposal invoiced when the client accepts it, in basis points (5000 is half).',
  },
  'billing.due_days': {
    value: 7 as number,
    description: 'Days an invoice gives the client to pay.',
  },
  'billing.payment_instructions': {
    value: '' as string,
    description:
      'How a client pays an invoice: bank transfer details (IBAN), a PayPal link or CliQ alias. Shown on every invoice page. Empty: the page asks the client to reply for the details.',
  },
  'billing.trial_days': {
    value: 14 as number,
    description: 'Days a shop uses Zirr free before its plan starts. The trial page and the shop emails promise this.',
  },
  'billing.trial_plan_price': {
    value: { JOD: 299_000 } as PerCurrency,
    description:
      "What a shop pays when its trial ends, in the currency's smallest unit (JOD has 1000 fils: 299000 is 299 JOD). Only the first currency is used.",
  },
  'billing.trial_plan_every': {
    value: 'once' as string,
    description:
      'How often a shop pays after its trial: once (one invoice), month or year. Marking a trial lead "Won" starts this plan.',
  },
  'marketing.posts_per_week': {
    value: 3 as number,
    description:
      'Social posts Marketing schedules each week from the approved post templates, at most 7 (one a day). 0 stops the weekly posts.',
  },
  'engineering.repository': {
    value: 'abu-arandas/arandastech' as string,
    description: 'The GitHub repository the Engineering department files issues in.',
  },
  'engineering.repository_public': {
    value: true as boolean,
    description: 'Whether that repository is public. An issue in a public repository waits for the owner (Level 2).',
  },
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;

/** Settings that hold a web address: empty, or a link that starts with https://. */
const LINK_KEYS = new Set<string>(['sales.booking_link', 'sales.showcase_link']);
/** Settings that take one of a few words. */
const CHOICES: Record<string, string[]> = { 'billing.trial_plan_every': ['once', 'month', 'year'] };
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

export async function listPolicy(
  db: Db,
): Promise<Array<{ key: string; value: unknown; description: string; updated_at: Date; updated_by: string }>> {
  return db.query('select key, value, description, updated_at, updated_by from policy_settings order by key');
}

/** Changes one number on the policy sheet. The caller has already checked that the actor is the owner. */
export async function setPolicy<K extends PolicyKey>(db: Db, key: K, value: PolicyValue<K>, by: Actor): Promise<void> {
  if (!Object.hasOwn(POLICY_DEFAULTS, key)) throw invalid(`unknown policy setting ${key}`);
  const expected = POLICY_DEFAULTS[key].value;
  const sameKind = value === null || expected === null || typeof value === typeof expected;
  if (!sameKind) throw invalid(`policy setting ${key} expects a ${typeof expected}`);
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0))
    throw invalid(`policy setting ${key} cannot be negative`);
  // Amounts, shares and counts are whole numbers: minor units, basis points, micro-dollars, days.
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw invalid(`policy setting ${key} is a whole number`);
  // A per-currency setting is a map from a three-letter currency to a whole amount, or null for "no limit".
  if (typeof value === 'object' && value !== null) {
    const entries = Array.isArray(value) ? null : Object.entries(value as Record<string, unknown>);
    const fine = entries?.every(
      ([currency, amount]) =>
        /^[A-Z]{3}$/.test(currency) &&
        (amount === null || (typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0)),
    );
    if (!fine) throw invalid(`policy setting ${key} maps each currency (like USD) to a whole amount or null`);
  }
  if (LINK_KEYS.has(key) && typeof value === 'string' && value !== '' && !/^https:\/\/[^\s]+$/.test(value))
    throw invalid(`policy setting ${key} is a link that starts with https://`);
  if (CHOICES[key] && !CHOICES[key].includes(String(value)))
    throw invalid(`policy setting ${key} is one of: ${CHOICES[key].join(', ')}`);
  if (typeof value === 'string' && value.length > 2000)
    throw invalid(`policy setting ${key} is at most 2000 characters`);
  await db.tx(async (tx) => {
    await tx.query(
      `insert into policy_settings (key, value, description, updated_by) values ($1, $2::jsonb, $3, $4)
       on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [key, json(value), POLICY_DEFAULTS[key].description, by.id ?? by.kind],
    );
    await audit(tx, {
      actor: by,
      type: 'policy.changed',
      subject: { type: 'policy_setting', id: key },
      data: { value },
    });
  });
}
