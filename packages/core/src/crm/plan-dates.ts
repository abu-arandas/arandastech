import type { Db } from '../lib/db';

/**
 * The dates of a plan's invoices, and what paying a plan's invoice changes. Kept apart from plans.ts so that billing.ts
 * can use it without the two files importing each other.
 */

export type Every = 'once' | 'month' | 'year';

/** A calendar day as YYYY-MM-DD, in UTC like every other date on invoices. */
export const dayOf = (at: Date): string => at.toISOString().slice(0, 10);

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * The invoice day after `from`: the same day next month (or next year), or the month's last day when it is shorter.
 * The anchor keeps the 31st on the 31st after a 30-day month.
 */
export function nextInvoiceDay(from: string, every: Exclude<Every, 'once'>, anchorDay: number): string {
  const [year, month] = from.split('-').map(Number) as [number, number];
  const target =
    every === 'month'
      ? { year: year + Math.floor(month / 12), month: month % 12 }
      : { year: year + 1, month: month - 1 };
  const day = Math.min(anchorDay, daysInMonth(target.year, target.month));
  return dayOf(new Date(Date.UTC(target.year, target.month, day)));
}

/** The first invoice day on or after `today`, for a plan coming back after a hold. */
export function firstInvoiceDayFrom(
  from: string,
  every: Exclude<Every, 'once'>,
  anchorDay: number,
  today: string,
): string {
  let next = from;
  while (next < today) next = nextInvoiceDay(next, every, anchorDay);
  return next;
}

/**
 * A plan's invoice is paid. A one-off plan is then over. A plan on hold comes back once none of its late invoices is
 * still open, with its next invoice on its usual day, so the months it was on hold are not billed afterwards.
 */
export async function planInvoicePaid(db: Db, planId: string, now: Date): Promise<void> {
  const [plan] = await db.query<{ every: Every; status: string; anchor_day: number; next_invoice_on: string | null }>(
    'select every, status, anchor_day, next_invoice_on from plans where id = $1 for update',
    [planId],
  );
  if (!plan || !['active', 'on_hold'].includes(plan.status)) return;
  const [late] = await db.query<{ n: number }>(
    `select count(*)::int as n from invoices where plan_id = $1 and status = 'sent' and hold_notice_at is not null`,
    [planId],
  );
  if (plan.every === 'once') {
    await db.query(`update plans set status = 'ended', ended_at = $2, on_hold_at = null where id = $1`, [planId, now]);
    return;
  }
  if (plan.status !== 'on_hold' || (late?.n ?? 0) > 0) return;
  const today = dayOf(now);
  const next = firstInvoiceDayFrom(plan.next_invoice_on ?? today, plan.every, plan.anchor_day, today);
  await db.query(`update plans set status = 'active', on_hold_at = null, next_invoice_on = $2 where id = $1`, [
    planId,
    next,
  ]);
}
