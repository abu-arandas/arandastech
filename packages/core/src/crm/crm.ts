import { z } from 'zod';
import { audit } from '../governance/audit';
import { type Db, json, maybeOne, one } from '../lib/db';
import { invalid, notFound } from '../lib/errors';
import type { Actor, Locale } from '../lib/types';
import { SYSTEM } from '../lib/types';

/**
 * Text that tries to give a reader instructions instead of asking for help. This is a tripwire, not the defense:
 * the defense is that a run which has read outside content can only read and draft (blueprint 10.2).
 * A plain request such as "please refund my order" is not manipulation and is not flagged.
 */
const MANIPULATION: Array<[RegExp, string]> = [
  [/\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(instructions?|rules|prompt|polic(y|ies)|guidelines)\b/i, 'Tells the reader to ignore its instructions.'],
  [/\b(you are now|act as|pretend to be|new instructions?|system prompt|developer mode)\b/i, 'Tries to give the reader a new role or new instructions.'],
  [/\b(reveal|show|print|send|forward|export)\b[^.\n]{0,40}\b(system prompt|your instructions|api key|password|access token|secret|customer list|all customers)\b/i, 'Asks for instructions, secrets or other customers\' data.'],
  [/\bwithout (asking|approval|telling)\b/i, 'Asks for something to be done without approval.'],
  [/تجاهل[^.\n]{0,30}(التعليمات|تعليماتك|القواعد|الأوامر)/, 'Tells the reader to ignore its instructions.'],
  [/(أنت الآن|تعليمات جديدة|تصرّف ك|تصرف ك)/, 'Tries to give the reader a new role or new instructions.'],
  [/(اكشف|أرسل|اعرض)[^.\n]{0,30}(كلمة المرور|المفتاح|قائمة العملاء|تعليماتك)/, 'Asks for instructions, secrets or other customers\' data.'],
  [/(بدون|دون) (موافقة|إذن)/, 'Asks for something to be done without approval.'],
];

export function scanForManipulation(text: string): string[] {
  return [...new Set(MANIPULATION.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason))];
}

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  locale: Locale;
  project_type: string | null;
  package_id: string | null;
  message: string;
  source: string;
  stage: 'new' | 'qualified' | 'proposal_sent' | 'won' | 'lost' | 'in_delivery' | 'delivered' | 'paid' | 'retained';
  score: number | null;
  score_reasons: string[];
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: string;
  lead_id: string | null;
  customer_id: string | null;
  order_id: string | null;
  channel: 'email' | 'whatsapp' | 'form' | 'note';
  direction: 'in' | 'out' | 'draft';
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body: string;
  locale: Locale;
  untrusted: boolean;
  flagged: boolean;
  flag_reasons: string[];
  handled: boolean;
  created_at: Date;
}

const leadInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  phone: z.string().trim().max(40).optional(),
  locale: z.enum(['en', 'ar']),
  message: z.string().trim().min(1).max(5000),
  projectType: z.string().trim().max(80).optional(),
  packageId: z.string().trim().max(80).optional(),
  source: z.string().trim().max(40).default('website'),
});
export type LeadInput = z.input<typeof leadInput>;

/** Records an incoming message. Everything written outside the company is untrusted and is scanned before anyone reads it. */
export async function recordInbound(
  db: Db,
  message: { channel: MessageRow['channel']; from: string; subject?: string; body: string; locale: Locale; leadId?: string; orderId?: string; externalId?: string },
): Promise<MessageRow> {
  const reasons = scanForManipulation(`${message.subject ?? ''}\n${message.body}`);
  return db.tx(async (tx) => {
    const saved = one(
      await tx.query<MessageRow>(
        `insert into messages (lead_id, order_id, channel, direction, from_address, subject, body, locale, untrusted, flagged, flag_reasons, external_id)
         values ($1, $2, $3, 'in', $4, $5, $6, $7, true, $8, $9::jsonb, $10) returning *`,
        [message.leadId ?? null, message.orderId ?? null, message.channel, message.from, message.subject ?? null, message.body, message.locale, reasons.length > 0, json(reasons), message.externalId ?? null],
      ),
    );
    if (reasons.length) {
      await tx.query(`insert into security_alerts (severity, kind, summary, detail) values ('warning', 'manipulation_attempt', $1, $2::jsonb)`, [
        `A ${message.channel} message from ${message.from} tries to give instructions.`,
        json({ message_id: saved.id, reasons }),
      ]);
    }
    await audit(tx, { actor: SYSTEM, type: 'message.received', subject: { type: 'message', id: saved.id }, data: { channel: message.channel, flagged: reasons.length > 0, reasons } });
    return saved;
  });
}

/** A lead from the website form (blueprint 5.1 step 5). A repeated submission within ten minutes finds the same lead. */
export async function createLead(db: Db, raw: LeadInput, now: Date): Promise<{ lead: LeadRow; duplicate: boolean }> {
  const parsed = leadInput.safeParse(raw);
  if (!parsed.success) throw invalid('The form is not complete.', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  const input = parsed.data;
  const existing = maybeOne(
    await db.query<LeadRow>(`select * from leads where lower(email) = lower($1) and message = $2 and created_at > $3 order by created_at desc limit 1`, [input.email, input.message, new Date(now.getTime() - 600_000)]),
  );
  if (existing) return { lead: existing, duplicate: true };
  return db.tx(async (tx) => {
    const lead = one(
      await tx.query<LeadRow>(
        `insert into leads (name, email, phone, locale, project_type, package_id, message, source, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [input.name, input.email, input.phone ?? null, input.locale, input.projectType ?? null, input.packageId ?? null, input.message, input.source, now],
      ),
    );
    await recordInbound(tx, { channel: 'form', from: input.email, body: input.message, locale: input.locale, leadId: lead.id });
    await audit(tx, { actor: SYSTEM, type: 'lead.created', subject: { type: 'lead', id: lead.id }, data: { source: input.source, locale: input.locale, package_id: input.packageId ?? null } });
    return { lead, duplicate: false };
  });
}

export async function listLeads(db: Db, stage?: LeadRow['stage']): Promise<LeadRow[]> {
  return db.query<LeadRow>(`select * from leads where ($1::text is null or stage = $1) order by created_at desc limit 200`, [stage ?? null]);
}

/** Moves a lead along the pipeline, or records its score. An internal record: nothing leaves the company. */
export async function updateLead(db: Db, leadId: string, change: { stage?: LeadRow['stage']; score?: number; scoreReasons?: string[] }, by: Actor): Promise<LeadRow> {
  if (change.score !== undefined && !(Number.isInteger(change.score) && change.score >= 0 && change.score <= 100)) throw invalid('a score is a whole number from 0 to 100');
  const rows = await db.query<LeadRow>(
    `update leads set stage = coalesce($2, stage), score = coalesce($3, score), score_reasons = coalesce($4::jsonb, score_reasons) where id = $1 returning *`,
    [leadId, change.stage ?? null, change.score ?? null, change.scoreReasons ? json(change.scoreReasons) : null],
  );
  if (!rows[0]) throw notFound('lead');
  await audit(db, { actor: by, type: 'lead.updated', subject: { type: 'lead', id: leadId }, data: change });
  return rows[0];
}

export async function listInbox(db: Db, options: { unhandledOnly?: boolean } = {}): Promise<MessageRow[]> {
  return db.query<MessageRow>(`select * from messages where direction = 'in' and ($1::boolean is not true or not handled) order by created_at desc limit 200`, [options.unhandledOnly ?? false]);
}

export async function messagesFor(db: Db, ref: { leadId?: string; orderId?: string }): Promise<MessageRow[]> {
  return db.query<MessageRow>(`select * from messages where ($1::uuid is not null and lead_id = $1) or ($2::uuid is not null and order_id = $2) order by created_at`, [ref.leadId ?? null, ref.orderId ?? null]);
}
