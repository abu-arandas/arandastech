import { getPolicy } from '../governance/settings';
import type { Db } from '../lib/db';
import { STAGES } from './stages';

/** Where the month stands against the revenue goal, and what it still takes to reach it. Read-only. */

const DAY = 86_400_000;
const addDays = (at: Date, days: number): Date => new Date(at.getTime() + days * DAY);

/** About how many US cents one minor unit is worth. The dinar is pegged to the dollar; the euro is an estimate. */
const USD_CENTS_PER_MINOR: Record<string, number> = { USD: 1, JOD: 0.141, EUR: 1.08 };
export const toUsdCents = (amount: number, currency: string): number =>
  Math.round(amount * (USD_CENTS_PER_MINOR[currency] ?? 0));

/** Starting rates for the funnel, until the company's own records have enough to measure them. */
const DEFAULT_RATES = { reply: 0.05, meeting: 0.5, proposal: 0.6, win: 0.3 };
/** Leads contacted in 90 days before the company's own rates replace the defaults (with 5 proposals). */
const MEASURE_AFTER = 20;

type Rates = typeof DEFAULT_RATES & { measured: boolean };
type MoneyRow = { currency: string; amount: string };

export interface RevenueStatus {
  as_of: string;
  month: string;
  days_left: number;
  goal_usd_cents: number;
  collected_usd_cents: number;
  collected: Array<{ currency: string; amount_minor: number; source: 'invoices' | 'orders' }>;
  invoiced_unpaid_usd_cents: number;
  proposals_open_usd_cents: number;
  share_of_goal_bps: number;
  share_of_month_bps: number;
  on_track: boolean;
  average_deal_usd_cents: number;
  deals_needed: number;
  /** What it takes to win those deals, at the rates below. */
  needed: { proposals: number; meetings: number; replies: number; first_emails: number };
  rates: Rates;
  pipeline: Record<string, number>;
  this_month: {
    first_emails: number;
    follow_ups: number;
    replies: number;
    meetings: number;
    proposals: number;
    won: number;
  };
  follow_ups_due: number;
  prospects_waiting: number;
}

/** The month in Amman time, counted from the records at the moment of the request. */
export async function revenueStatus(db: Db, now: Date): Promise<RevenueStatus> {
  const { start, end } = await ammanMonth(db, now);
  const goal = toUsdCents((await getPolicy(db, 'revenue.monthly_goal_minor')).USD ?? 300_000, 'USD');
  const collected = await collectedBetween(db, start, end);
  const collectedUsd = collected.reduce((sum, r) => sum + toUsdCents(r.amount_minor, r.currency), 0);
  const unpaid = usd(
    await db.query<MoneyRow>(
      `select currency, sum(total_minor)::text as amount from invoices where status = 'sent' group by currency`,
    ),
  );
  const openProposals = usd(
    await db.query<MoneyRow>(
      `select currency, sum(total_minor)::text as amount from proposals where status = 'sent' group by currency`,
    ),
  );
  const averageDeal = await usualDeal(db, now);
  const rates = await funnelRates(db, now);
  const dealsNeeded = Math.ceil(Math.max(0, goal - collectedUsd - unpaid) / averageDeal);
  const due = await followUps(db, now);
  const shareOfMonth = Math.round(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 10_000);
  const shareOfGoal = goal > 0 ? Math.min(10_000, Math.round((collectedUsd / goal) * 10_000)) : 10_000;
  return {
    as_of: now.toISOString(),
    month: new Date(start.getTime() + 12 * 3_600_000).toISOString().slice(0, 7),
    days_left: Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY)),
    goal_usd_cents: goal,
    collected_usd_cents: collectedUsd,
    collected,
    invoiced_unpaid_usd_cents: unpaid,
    proposals_open_usd_cents: openProposals,
    share_of_goal_bps: shareOfGoal,
    share_of_month_bps: shareOfMonth,
    on_track: shareOfGoal >= shareOfMonth,
    average_deal_usd_cents: averageDeal,
    deals_needed: dealsNeeded,
    needed: neededFor(dealsNeeded, rates),
    rates,
    pipeline: await pipelineCounts(db),
    this_month: await monthActivity(db, start),
    follow_ups_due: due.due,
    prospects_waiting: due.waiting,
  };
}

const usd = (rows: MoneyRow[]): number => rows.reduce((sum, r) => sum + toUsdCents(Number(r.amount), r.currency), 0);

/** The start and end of the current month in Amman. */
async function ammanMonth(db: Db, now: Date): Promise<{ start: Date; end: Date }> {
  const [month] = await db.query<{ start: Date; end: Date }>(
    `select (date_trunc('month', $1::timestamptz at time zone 'Asia/Amman') at time zone 'Asia/Amman') as start,
            ((date_trunc('month', $1::timestamptz at time zone 'Asia/Amman') + interval '1 month') at time zone 'Asia/Amman') as end`,
    [now],
  );
  return month!;
}

/** Money in this month: paid invoices and paid shop orders, by currency. */
async function collectedBetween(db: Db, start: Date, end: Date): Promise<RevenueStatus['collected']> {
  const invoices = await db.query<MoneyRow>(
    `select currency, sum(total_minor)::text as amount from invoices where status = 'paid' and paid_at >= $1 and paid_at < $2 group by currency`,
    [start, end],
  );
  const orders = await db.query<MoneyRow>(
    `select currency, sum(total_minor)::text as amount from orders
     where paid_at >= $1 and paid_at < $2 and status not in ('refunded', 'canceled', 'expired', 'pending_payment') group by currency`,
    [start, end],
  );
  return [
    ...invoices.map((r) => ({ currency: r.currency, amount_minor: Number(r.amount), source: 'invoices' as const })),
    ...orders.map((r) => ({ currency: r.currency, amount_minor: Number(r.amount), source: 'orders' as const })),
  ];
}

/** The usual deal: the average paid invoice of the last six months once there are five, the policy's guess before. */
async function usualDeal(db: Db, now: Date): Promise<number> {
  const [paid] = await db.query<{ n: number; avg: string | null }>(
    `select count(*)::int as n, avg(total_minor)::text as avg from invoices
     where status = 'paid' and paid_at > $1 and currency = 'USD'`,
    [addDays(now, -182)],
  );
  if (paid && paid.n >= 5) return Math.round(Number(paid.avg));
  return (await getPolicy(db, 'revenue.average_deal_minor')).USD ?? 100_000;
}

/** The company's own funnel rates over 90 days once it has enough records, the defaults before. */
async function funnelRates(db: Db, now: Date): Promise<Rates> {
  const [counts] = (await db.query<{ contacted: number; replied: number; met: number; proposed: number; won: number }>(
    `select count(*) filter (where last_contact_at is not null or stage <> 'new')::int as contacted,
            count(*) filter (where replied_at is not null)::int as replied,
            count(*) filter (where stage in ('meeting', 'qualified', 'proposal_sent', 'won', 'in_delivery', 'delivered', 'paid', 'retained'))::int as met,
            (select count(*)::int from proposals where status <> 'draft' and created_at > $1) as proposed,
            (select count(*)::int from proposals where status = 'accepted' and created_at > $1) as won
     from leads where created_at > $1`,
    [addDays(now, -90)],
  )) as [{ contacted: number; replied: number; met: number; proposed: number; won: number }];
  const measured = counts.contacted >= MEASURE_AFTER && counts.proposed >= 5;
  const rate = (part: number, whole: number, fallback: number): number =>
    measured && whole > 0 && part > 0 ? Math.min(1, part / whole) : fallback;
  return {
    reply: rate(counts.replied, counts.contacted, DEFAULT_RATES.reply),
    meeting: rate(counts.met, counts.replied, DEFAULT_RATES.meeting),
    proposal: rate(counts.proposed, counts.met, DEFAULT_RATES.proposal),
    win: rate(counts.won, counts.proposed, DEFAULT_RATES.win),
    measured,
  };
}

/** Works back from the deals needed through each stage of the funnel. */
function neededFor(deals: number, rates: Rates): RevenueStatus['needed'] {
  const proposals = Math.ceil(deals / rates.win);
  const meetings = Math.ceil(proposals / rates.proposal);
  const replies = Math.ceil(meetings / rates.meeting);
  return { proposals, meetings, replies, first_emails: Math.ceil(replies / rates.reply) };
}

async function pipelineCounts(db: Db): Promise<Record<string, number>> {
  const stages = await db.query<{ stage: string; n: number }>(
    `select stage, count(*)::int as n from leads group by stage`,
  );
  return Object.fromEntries(STAGES.map((stage) => [stage, stages.find((s) => s.stage === stage)?.n ?? 0]));
}

/** What Sales and the owner did since the month began. */
async function monthActivity(db: Db, start: Date): Promise<RevenueStatus['this_month']> {
  const [month] = await db.query<RevenueStatus['this_month']>(
    `select
       (select count(*)::int from actions where action_type = 'gmail.send_email' and status = 'executed' and executed_at >= $1
          and payload ->> 'template' in ('prospect-intro', 'shop-intro')) as first_emails,
       (select count(*)::int from actions where action_type = 'gmail.send_email' and status = 'executed' and executed_at >= $1
          and payload ->> 'template' in ('prospect-follow-up', 'shop-follow-up', 'prospect-close', 'shop-close', 'lead-follow-up', 'proposal-reminder', 'invoice-reminder')) as follow_ups,
       (select count(*)::int from leads where replied_at >= $1) as replies,
       (select count(*)::int from leads where stage = 'meeting' and updated_at >= $1) as meetings,
       (select count(*)::int from proposals where sent_at >= $1) as proposals,
       (select count(*)::int from proposals where status = 'accepted' and decided_at >= $1) as won`,
    [start],
  );
  return month!;
}

async function followUps(db: Db, now: Date): Promise<{ due: number; waiting: number }> {
  const [due] = await db.query<{ due: number; waiting: number }>(
    `select count(*) filter (where next_step_at <= $1)::int as due,
            count(*) filter (where kind = 'prospect' and stage = 'new')::int as waiting
     from leads where next_step_at is not null and not do_not_contact`,
    [now],
  );
  return due!;
}
