import type { Locale } from '../lib/types';

/** A workflow's input and the records it reads, as plain JSON. */
export type Json = Record<string, unknown>;

/** The English or the Arabic of a fixed sentence, by the reader's language. */
export const say = (en: string, ar: string, locale: Locale): string => (locale === 'ar' ? ar : en);

/**
 * The inbound leads still waiting for their first answer, as a condition on `leads l`: they wrote to us, did not opt
 * out, and no reply or draft was prepared for them. A lead scored high enough is moved to qualified before its reply
 * exists, so the stage alone does not say it was answered.
 */
export const AWAITING_REPLY = `l.kind = 'inbound' and l.stage in ('new', 'qualified') and not l.do_not_contact
  and not exists (select 1 from actions a where a.payload ->> 'lead_id' = l.id::text and a.action_type in ('gmail.send_email', 'gmail.create_draft'))`;
