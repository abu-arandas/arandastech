import { withdrawEmailsTo } from '../governance/approvals';
import { audit } from '../governance/audit';
import type { Db } from '../lib/db';
import { SYSTEM } from '../lib/types';

/**
 * Keeping the owner's mailbox in good standing: a delivery failure notice marks the address bounced and stops every
 * email to it, the one-click unsubscribe link stops a lead's emails, and a high bounce rate halves the daily limit.
 */

const DAY = 86_400_000;
const BOUNCE_WINDOW_DAYS = 14;
/** Fewer sends than this say nothing about the rate yet. */
const MIN_SENDS = 20;
export const MAX_BOUNCE_RATE = 0.05;

const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon)@/i;
const BOUNCE_SUBJECT =
  /delivery status notification|undeliver|delivery (has )?failed|mail delivery (failed|subsystem)|returned mail|failure notice|address not found|تعذر التسليم/i;
const ADDRESS = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An email Sales really sent: proposed and approved are not enough. */
const SENT_TO = `exists (select 1 from actions a where a.action_type = 'gmail.send_email' and a.status = 'executed'
  and lower(a.recipient) = lower(leads.email))`;

/** True for a mail server's notice that an email could not be delivered. */
export function isBounceNotice(message: { from: string; subject?: string }): boolean {
  return BOUNCE_SENDER.test(message.from.trim()) && BOUNCE_SUBJECT.test(message.subject ?? '');
}

/**
 * Marks each lead the notice names, and that Sales really sent an email to, as bounced: no email reaches it again. Returns
 * the addresses marked. Only addresses an email was really sent to count, so a forged notice cannot silence anyone else.
 */
export async function noteBounce(
  db: Db,
  message: { from: string; subject?: string; body: string },
  now: Date,
): Promise<string[]> {
  if (!isBounceNotice(message)) return [];
  const named = [...new Set((message.body.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))].filter(
    (a) => !BOUNCE_SENDER.test(a),
  );
  if (!named.length) return [];
  const marked = await db.query<{ id: string; email: string }>(
    `update leads set bounced_at = coalesce(bounced_at, $2), do_not_contact = true, sequence = null, next_step_at = null,
       notes = trim(notes || E'\\nThe address bounced on ' || to_char($2::timestamptz, 'YYYY-MM-DD') || '.')
     where lower(email) = any($1::text[]) and bounced_at is null and ${SENT_TO}
     returning id, email`,
    [named, now],
  );
  await withdrawEmailsTo(
    db,
    marked.map((lead) => lead.email),
    'The address bounced.',
  );
  for (const lead of marked)
    await audit(db, { actor: SYSTEM, type: 'lead.bounced', subject: { type: 'lead', id: lead.id } });
  return marked.map((lead) => lead.email);
}

/** The share of addresses Sales sent to in the last two weeks that bounced, and how many were sent to. */
export async function bounceRate(db: Db, now: Date): Promise<{ rate: number; contacted: number; bounced: number }> {
  const since = new Date(now.getTime() - BOUNCE_WINDOW_DAYS * DAY);
  const [row] = await db.query<{ contacted: number; bounced: number }>(
    `select count(distinct lower(a.recipient))::int as contacted,
       count(distinct lower(a.recipient)) filter (where l.bounced_at is not null)::int as bounced
     from actions a left join leads l on lower(l.email) = lower(a.recipient)
     where a.action_type = 'gmail.send_email' and a.status = 'executed' and a.executed_at > $1`,
    [since],
  );
  const contacted = row?.contacted ?? 0;
  const bounced = row?.bounced ?? 0;
  return { rate: contacted >= MIN_SENDS ? bounced / contacted : 0, contacted, bounced };
}

/** The daily limit, halved while more than 5% of recent addresses bounced, so a bad list cannot harm the mailbox. */
export async function safeSendLimit(db: Db, limit: number, now: Date): Promise<{ limit: number; halved: boolean }> {
  const { rate } = await bounceRate(db, now);
  return rate > MAX_BOUNCE_RATE ? { limit: Math.floor(limit / 2), halved: true } : { limit, halved: false };
}

/** Whether the lead behind an unsubscribe link has stopped the emails. Unknown links say no. */
export async function optedOut(db: Db, token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const [lead] = await db.query<{ do_not_contact: boolean }>(
    `select do_not_contact from leads where opt_out_token = $1::uuid`,
    [token],
  );
  return lead?.do_not_contact ?? false;
}

/** The one-click unsubscribe: the lead is never written to again. Unknown links change nothing and say so. */
export async function optOut(db: Db, token: string, now: Date): Promise<boolean> {
  if (!TOKEN.test(token)) return false;
  const [lead] = await db.query<{ id: string; email: string; do_not_contact: boolean }>(
    `select id, email, do_not_contact from leads where opt_out_token = $1::uuid`,
    [token],
  );
  if (!lead) return false;
  if (!lead.do_not_contact) {
    await db.query(
      `update leads set do_not_contact = true, sequence = null, next_step_at = null,
         notes = trim(notes || E'\\nUnsubscribed by the link on ' || to_char($2::timestamptz, 'YYYY-MM-DD') || '.')
       where id = $1`,
      [lead.id, now],
    );
    await withdrawEmailsTo(db, [lead.email], 'They unsubscribed.');
    await audit(db, { actor: SYSTEM, type: 'lead.unsubscribed', subject: { type: 'lead', id: lead.id } });
  }
  return true;
}
