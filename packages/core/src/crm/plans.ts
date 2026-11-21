import { z } from 'zod';
import { enqueue } from '../agents/jobs';
import { audit } from '../governance/audit';
import { getPolicy } from '../governance/settings';
import { type Db, json, maybeOne, one } from '../lib/db';
import { invalid, notFound } from '../lib/errors';
import { toMinor } from '../lib/money';
import type { Actor, Locale } from '../lib/types';
import { insertInvoice, type InvoiceRow } from './billing';
import type { LeadRow } from './crm';
import { dayOf, type Every, firstInvoiceDayFrom, nextInvoiceDay } from './plan-dates';

/**
 * Plans (work package 4): what a client pays on a schedule, or once after a free trial. Each morning Sales raises the
 * invoices that fall due and emails them; the usual two reminders follow; an invoice still unpaid 14 days after its
 * due date puts the plan on hold with a polite note, and paying it brings the plan back. Payment is by bank or CliQ,
 * marked paid by the owner in one tap, until card payments open.
 */

export interface PlanRow {
  id: string;
  lead_id: string;
  title: string;
  amount_minor: number;
  currency: string;
  every: Every;
  status: 'trial' | 'active' | 'on_hold' | 'ended' | 'cancelled';
  anchor_day: number;
  next_invoice_on: string | null;
  invoices_made: number;
  buyer_name: string;
  buyer_email: string;
  locale: Locale;
  created_at: Date;
  on_hold_at: Date | null;
  ended_at: Date | null;
}

/** Days after an invoice's due date before its plan goes on hold: after both reminders (due day and a week later). */
const HOLD_AFTER_DAYS = 14;
const OPEN = ['trial', 'active', 'on_hold'];
const DAY = 86_400_000;

const SELECT = 'select * from plans';

const TITLES = { en: 'Zirr shop plan', ar: 'خطة زِرّ للمتجر' } as const;

const planInput = z.strictObject({
  lead_id: z.uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  amount: z.string().trim().min(1).max(20),
  currency: z.enum(['USD', 'JOD', 'EUR']).default('JOD'),
  every: z.enum(['once', 'month', 'year']),
  /** Free days before the first invoice. 0 bills today. */
  trial_days: z.number().int().min(0).max(90).default(0),
});

/** The owner starts a plan for a lead. A lead has at most one open plan. */
export async function startPlan(db: Db, raw: unknown, by: Actor, now: Date): Promise<PlanRow> {
  const parsed = planInput.safeParse(raw);
  if (!parsed.success) throw invalid('The plan needs a lead, an amount, a currency and how often it is paid.');
  const input = parsed.data;
  const lead = maybeOne(await db.query<LeadRow>('select * from leads where id = $1', [input.lead_id]));
  if (!lead) throw notFound('lead');
  const amount = toMinor(input.amount, input.currency);
  if (amount <= 0) throw invalid('the plan needs an amount above zero');
  const open = await planOf(db, lead.id);
  if (open) throw invalid(`${lead.company ?? lead.name} already has a plan. Cancel it first to start another.`);
  return insertPlan(db, lead, { ...input, title: input.title ?? TITLES[lead.locale], amount }, by, now);
}

/**
 * A shop that asked for the free trial is marked "Won": its trial plan starts from the policy sheet, free for the trial
 * days, then billed as set there. Nothing happens for other leads, or when the lead already has a plan.
 */
export async function startTrialPlan(db: Db, lead: LeadRow, by: Actor, now: Date): Promise<PlanRow | null> {
  if (lead.source !== 'trial' || (await planOf(db, lead.id))) return null;
  const prices = Object.entries(await getPolicy(db, 'billing.trial_plan_price')).filter(([, v]) => v);
  const [currency, amount] = prices[0] ?? [];
  if (!currency || !amount) return null;
  const every = (await getPolicy(db, 'billing.trial_plan_every')) as Every;
  const trialDays = await getPolicy(db, 'billing.trial_days');
  return insertPlan(db, lead, { title: TITLES[lead.locale], amount, currency, every, trial_days: trialDays }, by, now);
}

async function insertPlan(
  db: Db,
  lead: LeadRow,
  p: { title: string; amount: number; currency: string; every: Every; trial_days: number },
  by: Actor,
  now: Date,
): Promise<PlanRow> {
  const firstDay = dayOf(new Date(now.getTime() + p.trial_days * DAY));
  return db.tx(async (tx) => {
    const plan = one(
      await tx.query<PlanRow>(
        `insert into plans (lead_id, title, amount_minor, currency, every, status, anchor_day, next_invoice_on,
           buyer_name, buyer_email, locale, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning *`,
        [
          lead.id,
          p.title,
          p.amount,
          p.currency,
          p.every,
          p.trial_days > 0 ? 'trial' : 'active',
          Number(firstDay.slice(8, 10)),
          firstDay,
          lead.company ?? lead.name,
          lead.email,
          lead.locale,
          now,
        ],
      ),
    );
    await audit(tx, {
      actor: by,
      type: 'plan.started',
      subject: { type: 'plan', id: plan.id },
      data: {
        lead_id: lead.id,
        amount_minor: p.amount,
        currency: p.currency,
        every: p.every,
        trial_days: p.trial_days,
      },
    });
    return plan;
  });
}

async function planOf(db: Db, leadId: string): Promise<PlanRow | null> {
  return maybeOne(await db.query<PlanRow>(`${SELECT} where lead_id = $1 and status = any($2::text[])`, [leadId, OPEN]));
}

async function planById(db: Db, planId: string): Promise<PlanRow> {
  const plan = maybeOne(await db.query<PlanRow>(`${SELECT} where id = $1`, [planId]));
  if (!plan) throw notFound('plan');
  return plan;
}

/** The client stops: no more invoices. Invoices already sent stay open until paid or cancelled. */
export async function cancelPlan(db: Db, planId: string, by: Actor, now: Date): Promise<PlanRow> {
  const plan = await planById(db, planId);
  if (!OPEN.includes(plan.status)) return plan;
  await db.query(`update plans set status = 'cancelled', ended_at = $2, next_invoice_on = null where id = $1`, [
    plan.id,
    now,
  ]);
  await audit(db, { actor: by, type: 'plan.cancelled', subject: { type: 'plan', id: plan.id } });
  return planById(db, plan.id);
}

/** The owner lifts a hold without waiting for the payment, for example after agreeing a later date with the client. */
export async function resumePlan(db: Db, planId: string, by: Actor, now: Date): Promise<PlanRow> {
  const plan = await planById(db, planId);
  if (plan.status !== 'on_hold') throw invalid('only a plan on hold can be resumed');
  const today = dayOf(now);
  const next =
    plan.every === 'once'
      ? null
      : firstInvoiceDayFrom(plan.next_invoice_on ?? today, plan.every, plan.anchor_day, today);
  await db.query(`update plans set status = 'active', on_hold_at = null, next_invoice_on = $2 where id = $1`, [
    plan.id,
    next,
  ]);
  await audit(db, { actor: by, type: 'plan.resumed', subject: { type: 'plan', id: plan.id } });
  return planById(db, plan.id);
}

export async function listPlans(db: Db): Promise<PlanRow[]> {
  return db.query<PlanRow>(`${SELECT} order by created_at desc limit 200`);
}

/**
 * Raises today's invoices: one for every trial or active plan whose day has come, then moves the plan to its next day
 * (a one-off plan has none). Each invoice is handed to Sales to email. Running twice on one day raises nothing new.
 */
export async function billDuePlans(db: Db, now: Date): Promise<InvoiceRow[]> {
  const today = dayOf(now);
  const due = await db.query<PlanRow>(
    `${SELECT} where status in ('trial', 'active') and next_invoice_on <= $1 order by next_invoice_on limit 50`,
    [today],
  );
  const raised: InvoiceRow[] = [];
  for (const plan of due) raised.push(await billPlan(db, plan, today, now));
  return raised;
}

async function billPlan(db: Db, plan: PlanRow, today: string, now: Date): Promise<InvoiceRow> {
  return db.tx(async (tx) => {
    const invoice = await insertInvoice(tx, {
      leadId: plan.lead_id,
      proposalId: null,
      planId: plan.id,
      title: plan.title,
      items: [{ description: periodLine(plan), amount_minor: Number(plan.amount_minor) }],
      currency: plan.currency,
      buyerName: plan.buyer_name,
      buyerEmail: plan.buyer_email,
      locale: plan.locale,
      dueDays: await getPolicy(tx, 'billing.due_days'),
      now,
    });
    const next =
      plan.every === 'once' ? null : nextInvoiceDay(plan.next_invoice_on ?? today, plan.every, plan.anchor_day);
    await tx.query(
      `update plans set status = 'active', next_invoice_on = $2, invoices_made = invoices_made + 1 where id = $1`,
      [plan.id, next],
    );
    await enqueue(
      tx,
      'sales.send_document',
      { kind: 'invoice', id: invoice.id },
      { key: `send:invoice:${invoice.id}` },
    );
    await audit(tx, {
      actor: { kind: 'automation', id: 'plans' },
      type: 'plan.invoiced',
      subject: { type: 'plan', id: plan.id },
      data: { invoice: invoice.number, amount_minor: invoice.total_minor },
    });
    return invoice;
  });
}

/** The invoice line: the plan, and the period it pays for. */
function periodLine(plan: PlanRow): string {
  const start = plan.next_invoice_on ?? '';
  const words = {
    once: { en: plan.title, ar: plan.title },
    month: { en: `${plan.title}, month from ${start}`, ar: `${plan.title}، شهر يبدأ ${start}` },
    year: { en: `${plan.title}, year from ${start}`, ar: `${plan.title}، سنة تبدأ ${start}` },
  };
  return words[plan.every][plan.locale];
}

/**
 * Plans whose invoice is still unpaid 14 days after its due date go on hold: no new invoices, and Sales writes the
 * client one polite note (once per invoice). The owner hears about it in the alerts.
 */
export async function holdLatePlans(db: Db, now: Date): Promise<InvoiceRow[]> {
  const late = await db.query<InvoiceRow>(
    `select i.* from invoices i join plans p on p.id = i.plan_id
     where i.status = 'sent' and i.hold_notice_at is null and p.status in ('active', 'on_hold')
       and i.due_on + $2::int <= $1::date
     order by i.due_on limit 20`,
    [dayOf(now), HOLD_AFTER_DAYS],
  );
  for (const invoice of late)
    await db.tx(async (tx) => {
      await tx.query('update invoices set hold_notice_at = $2 where id = $1', [invoice.id, now]);
      await tx.query(
        `update plans set status = 'on_hold', on_hold_at = coalesce(on_hold_at, $2) where id = $1 and status = 'active'`,
        [invoice.plan_id, now],
      );
      await tx.query(
        `insert into security_alerts (severity, kind, summary, detail) values ('info', 'plan_on_hold', $1, $2::jsonb)`,
        [
          `${invoice.buyer_name}'s invoice ${invoice.number} is ${HOLD_AFTER_DAYS} days late, so their plan is on hold. Sales wrote to them.`,
          json({ invoice_id: invoice.id, plan_id: invoice.plan_id }),
        ],
      );
    });
  return late;
}
