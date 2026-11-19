import { z } from 'zod';
import { audit } from '../governance/audit';
import { type Db, maybeOne } from '../lib/db';
import { invalid, notFound } from '../lib/errors';
import { toMinor } from '../lib/money';
import type { Actor } from '../lib/types';
import type { LeadRow } from './crm';
import { STAGES, type Stage } from './stages';

/**
 * The sales pipeline: prospects the owner chooses to contact, and the follow-up sequences Sales runs for every lead.
 * Nothing here sends anything: Sales proposes each email to the gateway. The month against the goal is in revenue.ts.
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
