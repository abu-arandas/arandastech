import { z } from 'zod';
import { audit } from '../governance/audit';
import { getPolicy } from '../governance/settings';
import { type Db, maybeOne } from '../lib/db';
import { invalid, notFound } from '../lib/errors';
import { toMinor } from '../lib/money';
import type { Actor } from '../lib/types';
import type { LeadRow } from './crm';
import { STAGES, type Stage } from './stages';

/**
 * The sales pipeline: prospects the owner chooses to contact, the follow-up sequences Sales runs for every lead, and
 * where the month stands against the revenue goal. Nothing here sends anything: Sales proposes each email to the gateway.
 */

const DAY = 86_400_000;
const addDays = (at: Date, days: number): Date => new Date(at.getTime() + days * DAY);

export interface SequenceStep {
  template: string;
  /** Days from this email to the next step. */
  waitDays: number;
}

/**
 * Each sequence is its emails in order. After the last one the sequence ends, and `end` says where the lead goes:
 * an outreach nobody answered is lost, a client who had both check-ins is retained.
 */
export const SEQUENCES: Record<string, { steps: SequenceStep[]; end: Stage | null; startsAfterDays: number }> = {
  outreach: {
    startsAfterDays: 0,
    steps: [
      { template: 'prospect-intro', waitDays: 4 },
      { template: 'prospect-follow-up', waitDays: 7 },
      { template: 'prospect-close', waitDays: 14 },
    ],
    end: 'lost',
  },
  outreach_shop: {
    startsAfterDays: 0,
    steps: [
      { template: 'shop-intro', waitDays: 5 },
      { template: 'shop-follow-up', waitDays: 7 },
      { template: 'shop-close', waitDays: 14 },
    ],
    end: 'lost',
  },
  inbound: { startsAfterDays: 3, steps: [{ template: 'lead-follow-up', waitDays: 0 }], end: null },
  proposal: { startsAfterDays: 3, steps: [{ template: 'proposal-reminder', waitDays: 0 }], end: null },
  check_in: {
    startsAfterDays: 14,
    steps: [
      { template: 'client-check-in', waitDays: 46 },
      { template: 'client-referral', waitDays: 0 },
    ],
    end: 'retained',
  },
};
export type SequenceName = keyof typeof SEQUENCES;

/** A lead that is still being won. Only these get outreach and follow-ups. */
export const OPEN_STAGES: Stage[] = ['new', 'contacted', 'replied', 'meeting', 'qualified', 'proposal_sent'];

const OUTREACH = new Set(['outreach', 'outreach_shop', 'inbound']);

/** Puts a lead into a sequence, starting after the sequence's own delay. */
export async function startSequence(db: Db, leadId: string, sequence: SequenceName, now: Date): Promise<void> {
  const spec = SEQUENCES[sequence]!;
  await db.query(
    `update leads set sequence = $2, sequence_step = 0, next_step_at = $3, last_action_id = null
     where id = $1 and not do_not_contact`,
    [leadId, sequence, addDays(now, spec.startsAfterDays)],
  );
}

export async function stopSequence(db: Db, leadId: string): Promise<void> {
  await db.query(`update leads set sequence = null, next_step_at = null where id = $1`, [leadId]);
}

// ---------------------------------------------------------------- Prospects

const prospectInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  company: z.string().trim().min(1).max(160),
  website: z.string().trim().max(300).optional(),
  country: z.string().trim().max(60).optional(),
  locale: z.enum(['en', 'ar']).default('en'),
  audience: z.enum(['agency', 'shop']).default('agency'),
  notes: z.string().trim().max(2000).optional(),
  /** A value the owner expects from the deal, as a decimal, such as "1500". */
  value: z.string().trim().max(20).optional(),
  currency: z.enum(['USD', 'JOD', 'EUR']).default('USD'),
  /** For a prospect already written to by hand: how many outreach emails went, and the day the last one did. */
  already_sent: z.number().int().min(0).max(3).optional(),
  last_sent_on: z.iso.date().optional(),
});
export type ProspectInput = z.input<typeof prospectInput>;

/**
 * Adds businesses the owner chose to contact. Sales writes to each one from the outreach sequence, at most the daily
 * limit a day. An address that asked not to be contacted, or that is already a prospect, is skipped and said why.
 */
export async function addProspects(
  db: Db,
  list: unknown[],
  by: Actor,
  now: Date,
): Promise<{ added: number; skipped: Array<{ email: string; reason: string }> }> {
  if (!Array.isArray(list) || list.length === 0) throw invalid('send at least one prospect');
  if (list.length > 200) throw invalid('send at most 200 prospects at a time');
  const parsed = list.map((item, index) => {
    const result = prospectInput.safeParse(item);
    if (!result.success)
      throw invalid(
        `prospect ${index + 1} is not complete`,
        result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      );
    return result.data;
  });
  const skipped: Array<{ email: string; reason: string }> = [];
  let added = 0;
  await db.tx(async (tx) => {
    for (const p of parsed) {
      const known = await tx.query<{ kind: string; do_not_contact: boolean }>(
        `select kind, do_not_contact from leads where lower(email) = lower($1)`,
        [p.email],
      );
      if (known.some((lead) => lead.do_not_contact)) {
        skipped.push({ email: p.email, reason: 'asked not to be contacted' });
        continue;
      }
      if (known.length) {
        skipped.push({ email: p.email, reason: 'already in the pipeline' });
        continue;
      }
      const sequence: SequenceName = p.audience === 'shop' ? 'outreach_shop' : 'outreach';
      const steps = SEQUENCES[sequence]!.steps;
      const sent = p.already_sent ?? 0;
      const lastSent = p.last_sent_on ? new Date(`${p.last_sent_on}T06:00:00Z`) : now;
      const next = sent === 0 ? now : addDays(lastSent, steps[Math.min(sent, steps.length) - 1]!.waitDays);
      await tx.query(
        `insert into leads (kind, name, email, company, website, country, locale, message, source, notes, value_minor,
           value_currency, stage, sequence, sequence_step, next_step_at, last_contact_at, created_at)
         values ('prospect', $1, $2, $3, $4, $5, $6, '', 'outreach', $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          p.name,
          p.email,
          p.company,
          p.website ?? null,
          p.country ?? null,
          p.locale,
          p.notes ?? '',
          p.value ? toMinor(p.value, p.currency) : null,
          p.value ? p.currency : null,
          sent > 0 ? 'contacted' : 'new',
          sequence,
          sent,
          next,
          sent > 0 ? lastSent : null,
          now,
        ],
      );
      added += 1;
    }
    await audit(tx, {
      actor: by,
      type: 'prospects.added',
      subject: { type: 'leads', id: 'prospects' },
      data: { added, skipped: skipped.length },
    });
  });
  return { added, skipped };
}

// ---------------------------------------------------------------- Moving a lead by hand

const change = z.strictObject({
  stage: z.enum(STAGES).optional(),
  value: z.string().trim().max(20).nullable().optional(),
  currency: z.enum(['USD', 'JOD', 'EUR']).optional(),
  notes: z.string().max(2000).optional(),
  do_not_contact: z.boolean().optional(),
  /** False stops the sequence the lead is in. */
  follow_up: z.boolean().optional(),
});
export type PipelineChange = z.input<typeof change>;

/** The owner moves a lead: a stage, the value, a note, or stops the emails. An internal record: nothing is sent. */
export async function changeLead(db: Db, leadId: string, raw: unknown, by: Actor): Promise<LeadRow> {
  const parsed = change.safeParse(raw);
  if (!parsed.success) throw invalid('The change is not valid.');
  const c = parsed.data;
  const lead = maybeOne(await db.query<LeadRow>('select * from leads where id = $1', [leadId]));
  if (!lead) throw notFound('lead');
  const currency = c.currency ?? lead.value_currency ?? 'USD';
  const value = c.value === undefined ? lead.value_minor : c.value === null ? null : toMinor(c.value, currency);
  // Outreach ends once the lead answers, meets, wins or is lost: from there a person, or a later sequence, takes over.
  const leavesOutreach = c.stage !== undefined && c.stage !== 'new' && c.stage !== 'contacted';
  const stop =
    c.follow_up === false || c.do_not_contact === true || (leavesOutreach && OUTREACH.has(lead.sequence ?? ''));
  const [updated] = await db.query<LeadRow>(
    `update leads set stage = $2, value_minor = $3, value_currency = $4, notes = $5, do_not_contact = $6,
       sequence = case when $7 then null else sequence end, next_step_at = case when $7 then null else next_step_at end
     where id = $1 returning *`,
    [
      leadId,
      c.stage ?? lead.stage,
      value,
      value === null ? null : currency,
      c.notes ?? lead.notes,
      c.do_not_contact ?? lead.do_not_contact,
      stop,
    ],
  );
  await audit(db, {
    actor: by,
    type: 'lead.updated',
    subject: { type: 'lead', id: leadId },
    data: { ...c, stopped_sequence: stop },
  });
  return updated!;
}

// ---------------------------------------------------------------- A lead writes back

const NO_MORE =
  /\b(unsubscribe|not interested|no thanks|no, thanks|no thank you|remove me|stop (emailing|writing|contacting)|do not (contact|email)|don't (contact|email))\b|لا شكرا|لا شكراً|غير مهتم|غير مهتمين|ألغ|الغاء الاشتراك|إلغاء الاشتراك|توقف عن مراسلت|لا تراسل/i;

/** True when a reply asks for no more emails. Such a lead is never written to again. */
export const wantsNoMore = (text: string): boolean => NO_MORE.test(text);

/** The lead an email comes from, while it is still being won, so its reply goes to Sales and stops the follow-ups. */
export async function openLeadFrom(db: Db, address: string): Promise<LeadRow | null> {
  return maybeOne(
    await db.query<LeadRow>(
      `select * from leads where lower(email) = lower($1) and stage = any($2::text[]) order by updated_at desc limit 1`,
      [address, OPEN_STAGES],
    ),
  );
}

/**
 * Google Calendar's booking notice names the person who booked. When it names a lead, that lead has a meeting.
 * The notice is outside content: it only moves a stage, and nothing is sent because of it.
 */
export async function noteBooking(
  db: Db,
  message: { from: string; subject: string; body: string },
): Promise<LeadRow | null> {
  if (!/@google\.com$/i.test(message.from) || !/(booked|appointment|حجز|موعد)/i.test(message.subject)) return null;
  const addresses = [...new Set(message.body.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [])];
  for (const address of addresses) {
    const lead = await openLeadFrom(db, address);
    if (!lead) continue;
    const [updated] = await db.query<LeadRow>(
      `update leads set stage = 'meeting', sequence = case when sequence = any($2::text[]) then null else sequence end,
         next_step_at = case when sequence = any($2::text[]) then null else next_step_at end
       where id = $1 returning *`,
      [lead.id, [...OUTREACH]],
    );
    return updated ?? null;
  }
  return null;
}

// ---------------------------------------------------------------- The month against the goal

/** About how many US cents one minor unit is worth. The dinar is pegged to the dollar; the euro is an estimate. */
const USD_CENTS_PER_MINOR: Record<string, number> = { USD: 1, JOD: 0.141, EUR: 1.08 };
export const toUsdCents = (amount: number, currency: string): number =>
  Math.round(amount * (USD_CENTS_PER_MINOR[currency] ?? 0));

/** Starting rates for the funnel, until the company's own records have enough to measure them. */
export const DEFAULT_RATES = { reply: 0.05, meeting: 0.5, proposal: 0.6, win: 0.3 };
const MEASURE_AFTER = 20;

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
  rates: typeof DEFAULT_RATES & { measured: boolean };
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
  const [{ start, end }] = (await db.query<{ start: Date; end: Date }>(
    `select (date_trunc('month', $1::timestamptz at time zone 'Asia/Amman') at time zone 'Asia/Amman') as start,
            ((date_trunc('month', $1::timestamptz at time zone 'Asia/Amman') + interval '1 month') at time zone 'Asia/Amman') as end`,
    [now],
  )) as [{ start: Date; end: Date }];
  const goal = toUsdCents((await getPolicy(db, 'revenue.monthly_goal_minor')).USD ?? 300_000, 'USD');
  const invoices = await db.query<{ currency: string; amount: string }>(
    `select currency, sum(total_minor)::text as amount from invoices where status = 'paid' and paid_at >= $1 and paid_at < $2 group by currency`,
    [start, end],
  );
  const orders = await db.query<{ currency: string; amount: string }>(
    `select currency, sum(total_minor)::text as amount from orders
     where paid_at >= $1 and paid_at < $2 and status not in ('refunded', 'canceled', 'expired', 'pending_payment') group by currency`,
    [start, end],
  );
  const collected = [
    ...invoices.map((r) => ({ currency: r.currency, amount_minor: Number(r.amount), source: 'invoices' as const })),
    ...orders.map((r) => ({ currency: r.currency, amount_minor: Number(r.amount), source: 'orders' as const })),
  ];
  const collectedUsd = collected.reduce((sum, r) => sum + toUsdCents(r.amount_minor, r.currency), 0);
  const sumUsd = async (sql: string): Promise<number> =>
    (await db.query<{ currency: string; amount: string }>(sql)).reduce(
      (sum, r) => sum + toUsdCents(Number(r.amount), r.currency),
      0,
    );
  const unpaid = await sumUsd(
    `select currency, sum(total_minor)::text as amount from invoices where status = 'sent' group by currency`,
  );
  const openProposals = await sumUsd(
    `select currency, sum(total_minor)::text as amount from proposals where status = 'sent' group by currency`,
  );

  // The usual deal: the average paid invoice of the last six months once there are five, the policy's guess before.
  const [paidDeals] = await db.query<{ n: number; currency: string | null; avg: string | null }>(
    `select count(*)::int as n, min(currency) as currency, avg(total_minor)::text as avg from invoices
     where status = 'paid' and paid_at > $1 and currency = 'USD'`,
    [addDays(now, -182)],
  );
  const guess = (await getPolicy(db, 'revenue.average_deal_minor')).USD ?? 100_000;
  const averageDeal = paidDeals && paidDeals.n >= 5 ? Math.round(Number(paidDeals.avg)) : guess;

  const [counts] = (await db.query<{
    contacted: number;
    replied: number;
    met: number;
    proposed: number;
    won: number;
  }>(
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
  const rates = {
    reply: rate(counts.replied, counts.contacted, DEFAULT_RATES.reply),
    meeting: rate(counts.met, counts.replied, DEFAULT_RATES.meeting),
    proposal: rate(counts.proposed, counts.met, DEFAULT_RATES.proposal),
    win: rate(counts.won, counts.proposed, DEFAULT_RATES.win),
    measured,
  };

  const remaining = Math.max(0, goal - collectedUsd);
  const dealsNeeded = Math.ceil(Math.max(0, remaining - unpaid) / averageDeal);
  const proposals = Math.ceil(dealsNeeded / rates.win);
  const meetings = Math.ceil(proposals / rates.proposal);
  const replies = Math.ceil(meetings / rates.meeting);
  const firstEmails = Math.ceil(replies / rates.reply);

  const stages = await db.query<{ stage: string; n: number }>(
    `select stage, count(*)::int as n from leads group by stage`,
  );
  const pipeline = Object.fromEntries(STAGES.map((stage) => [stage, stages.find((s) => s.stage === stage)?.n ?? 0]));
  const [month] = (await db.query<RevenueStatus['this_month']>(
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
  )) as [RevenueStatus['this_month']];
  const [due] = (await db.query<{ due: number; waiting: number }>(
    `select count(*) filter (where next_step_at <= $1)::int as due,
            count(*) filter (where kind = 'prospect' and stage = 'new')::int as waiting
     from leads where next_step_at is not null and not do_not_contact`,
    [now],
  )) as [{ due: number; waiting: number }];

  const monthMs = end.getTime() - start.getTime();
  const shareOfMonth = Math.round(((now.getTime() - start.getTime()) / monthMs) * 10_000);
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
    needed: { proposals, meetings, replies, first_emails: firstEmails },
    rates,
    pipeline,
    this_month: month,
    follow_ups_due: due.due,
    prospects_waiting: due.waiting,
  };
}
