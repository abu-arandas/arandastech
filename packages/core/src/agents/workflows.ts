import { z } from 'zod';
import { mayPropose } from '../api/mcp';
import { listLeads, type LeadRow, type MessageRow, updateLead } from '../crm/crm';
import { startSequence } from '../crm/pipeline';
import { SALES_LINES } from '../sales-templates';
import { assistantScore, combineScores, QUALIFIED, scoreLead } from '../crm/scoring';
import { getPolicy } from '../governance/settings';
import { json, maybeOne } from '../lib/db';
import type { Locale, Localized } from '../lib/types';
import { listApprovedMemory, renderTemplate } from '../memory';
import { AWAITING_REPLY, type Json, say } from './common';
import { firstName } from './sales';
import { type AgentRuntime, manualNote, type Run, type WorkflowContext } from './runtime';

/**
 * What each department does on its own (blueprint 7.3). Every workflow works without an AI model: Sales answers
 * from an approved template and scores by fixed rules, Support matches the approved FAQs, Operations and Finance
 * report figures calculated by code. With a model, the same workflow lets it write the text, and code still checks the
 * result, takes the figures from the books and sends every proposal through the gateway.
 */

export interface Proposed {
  action_id: string;
  type: string;
  level: number;
  status: string;
  summary: string;
}

async function propose(
  rt: AgentRuntime,
  run: Run,
  type: string,
  payload: Json,
  evidence: unknown[],
  key: string,
): Promise<Proposed> {
  if (!mayPropose(run.department).includes(type))
    throw new Error(`The ${run.department} department may not propose ${type}.`);
  const { action } = await rt.platform.gateway.propose({
    type,
    payload,
    requester: { kind: 'agent', id: run.department },
    evidence,
    idempotencyKey: key,
    agentRunId: run.id,
    taskId: run.taskId,
    untrustedInput: run.untrusted || undefined,
  });
  return { action_id: action.id, type, level: action.level, status: action.status, summary: action.summary };
}

/** The approved facts a department may tell a customer: the brand, the packages and the FAQs. */
async function companyFacts(rt: AgentRuntime): Promise<{
  brand: unknown;
  packages: Array<{ id: string; name: Localized; outcome: Localized; deliverables: Localized[]; price_kind: string }>;
  faqs: Array<{ key: string; question: Localized; answer: Localized }>;
}> {
  const memory = await listApprovedMemory(rt.db);
  const packages = await rt.db.query<{
    id: string;
    name: Localized;
    outcome: Localized;
    deliverables: Localized[];
    price_kind: string;
  }>(
    `select id, name, outcome, deliverables, price_kind from service_packages where status = 'approved' order by sort`,
  );
  return {
    brand: memory.find((item) => item.kind === 'brand')?.body ?? null,
    packages,
    faqs: memory
      .filter((item) => item.kind === 'faq')
      .map((item) => ({ key: item.key, ...(item.body as { question: Localized; answer: Localized }) })),
  };
}

// ---------------------------------------------------------------- Sales

const leadReplySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  score: z.number().int().min(0).max(100),
  score_reasons: z.array(z.string().max(200)).max(6),
  assumptions: z.array(z.string().max(300)).max(6),
});

/** The trial answer, or null while its template waits for the owner's approval. */
async function trialWelcome(rt: AgentRuntime, lead: LeadRow): Promise<{ subject: string; body: string } | null> {
  const link = await getPolicy(rt.db, 'sales.booking_link');
  try {
    return await renderTemplate(rt.db, 'trial-welcome', lead.locale, {
      first_name: firstName(lead.name),
      company: lead.company ?? lead.name,
      sender: await getPolicy(rt.db, 'sales.sender_name'),
      trial_days: String(await getPolicy(rt.db, 'billing.trial_days')),
      booking_line: link ? SALES_LINES.booking[lead.locale](link) : SALES_LINES.noBooking[lead.locale],
    });
  } catch {
    return null;
  }
}

async function leadReply(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('sales.lead_reply', ctx, input, async (run) => {
    const lead = maybeOne(await rt.db.query<LeadRow>('select * from leads where id = $1', [input.lead_id]));
    if (!lead) return { skipped: 'The lead no longer exists.' };
    // A prospect never wrote to us: it gets the outreach sequence, never a thank-you for a form it did not send.
    if (lead.kind === 'prospect')
      return { skipped: 'Prospects get the outreach emails, not the reply to a website form.' };
    if (lead.do_not_contact) return { skipped: 'The lead asked not to be contacted.' };
    const form = maybeOne(
      await rt.db.query<MessageRow>(
        `select * from messages where lead_id = $1 and direction = 'in' order by created_at limit 1`,
        [lead.id],
      ),
    );
    const flagged = form?.flagged ?? false;
    await rt.readOutside(run);
    const facts = await companyFacts(rt);
    const pkg = facts.packages.find((p) => p.id === lead.package_id);
    const evidence = [{ kind: 'lead', id: lead.id }, ...(form ? [{ kind: 'message', id: form.id }] : [])];

    let reply: { subject: string; body: string } | null = null;
    let scored = scoreLead(lead, flagged);
    let assumptions: string[] = [];
    let template: string | undefined;
    // A shop that asked for the free trial gets the fixed trial answer with the setup call link, when it is approved.
    if (!flagged && lead.source === 'trial') {
      reply = await trialWelcome(rt, lead);
      if (reply) {
        template = 'trial-welcome';
        evidence.push({ kind: 'memory', id: 'template:trial-welcome' });
      }
    }
    if (!flagged && !reply) {
      const written = await rt.think(run, {
        skills: ['lead-reply'],
        effort: 'medium',
        task: `Write the first reply to this lead, in ${lead.locale === 'ar' ? 'Arabic' : 'English'}, the language they wrote in. Thank them, show you understood what they need, say which of our packages fits and what happens next. Promise no price, date or deliverable that is not in the facts. Sign as Zirr. Also score the lead from 0 to 100 for how likely it is to become agreed work, with short reasons, and list your assumptions.`,
        facts: { lead: { name: lead.name, locale: lead.locale, chosen_package: lead.package_id }, ...facts },
        outside: { label: 'website form', content: lead.message },
        schema: leadReplySchema,
      });
      if (written) {
        reply = { subject: written.subject, body: written.body };
        scored = combineScores(scored, { score: written.score, reasons: written.score_reasons }, lead);
        assumptions = written.assumptions;
      }
    }
    if (!reply) {
      try {
        const about = pkg ? say(` about our ${pkg.name.en} package`, ` بخصوص باقة ${pkg.name.ar}`, lead.locale) : '';
        reply = await renderTemplate(rt.db, 'lead-reply', lead.locale, { name: lead.name, about });
        evidence.push({ kind: 'memory', id: 'template:lead-reply' });
      } catch {
        run.notes.push(
          'The lead-reply template is not approved yet, so no reply was written. Approve it in business memory.',
        );
      }
    }

    await updateLead(
      rt.db,
      lead.id,
      { score: scored.score, scoreReasons: scored.reasons },
      {
        kind: 'agent',
        id: 'sales',
      },
    );
    if (!flagged && scored.score >= QUALIFIED && lead.stage === 'new')
      await updateLead(rt.db, lead.id, { stage: 'qualified' }, { kind: 'agent', id: 'sales' });

    let action: Proposed | null = null;
    if (reply) {
      const payload = {
        to: lead.email,
        subject: reply.subject,
        body: reply.body,
        locale: lead.locale,
        lead_id: lead.id,
        ...(template ? { template } : {}),
      };
      // A message that tries to steer the bots gets a draft and nothing else (blueprint 15, step 8).
      action = flagged
        ? await propose(rt, run, 'gmail.create_draft', payload, evidence, `sales.lead_reply:draft:${lead.id}`)
        : await propose(rt, run, 'gmail.send_email', payload, evidence, `sales.lead_reply:${lead.id}`);
      if (flagged) run.notes.push('The message tries to give instructions, so only a draft was saved.');
    }
    if (form && action) await rt.db.query('update messages set handled = true where id = $1', [form.id]);
    // Without an answer from them, Sales follows up once, three days later.
    if (action && !flagged) await startSequence(rt.db, lead.id, 'inbound', rt.platform.clock());
    return { lead_id: lead.id, score: scored.score, score_reasons: scored.reasons, assumptions, action };
  });
}

async function qualifyLeads(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('sales.qualify_leads', ctx, input, async (run) => {
    const count = Math.min(20, Math.max(1, Number(input.count ?? 3) || 3));
    // Only people who wrote to us are scored: a prospect's stage is moved by its outreach sequence and its replies.
    // Someone who asked not to be contacted is left exactly as they are.
    const leads = (await listLeads(rt.db)).filter(
      (lead) => lead.kind === 'inbound' && !lead.do_not_contact && ['new', 'qualified'].includes(lead.stage),
    );
    await rt.readOutside(run);
    const flagged = new Set(
      (
        await rt.db.query<{ lead_id: string }>(
          `select distinct lead_id from messages where flagged and lead_id is not null`,
        )
      ).map((row) => row.lead_id),
    );
    const scored = [];
    for (const lead of leads) {
      // The rules again, with the assistant's part of the last score kept, so a model-assisted score is not lost.
      const isFlagged = flagged.has(lead.id);
      const rules = scoreLead(lead, isFlagged);
      const { score, reasons } = isFlagged ? rules : combineScores(rules, assistantScore(lead.score_reasons), lead);
      await updateLead(rt.db, lead.id, { score, scoreReasons: reasons }, { kind: 'agent', id: 'sales' });
      if (score >= QUALIFIED && lead.stage === 'new')
        await updateLead(rt.db, lead.id, { stage: 'qualified' }, { kind: 'agent', id: 'sales' });
      scored.push({ lead_id: lead.id, name: lead.name, score, reasons, qualified: score >= QUALIFIED });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((lead) => lead.qualified).slice(0, count);
    if (top.length < count)
      run.notes.push(
        `Only ${top.length} of the ${count} leads asked for meet the qualification score of ${QUALIFIED}.`,
      );
    return { qualified: top, looked_at: scored.length };
  });
}

async function replyNewLeads(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  const waiting = await rt.db.query<{ id: string }>(
    `select l.id from leads l where ${AWAITING_REPLY} order by l.created_at limit 5`,
  );
  const replies = [];
  for (const { id } of waiting) replies.push(await leadReply(rt, { lead_id: id }, ctx));
  return { replies, note: waiting.length ? null : 'Every lead already has a reply or a draft.' };
}

// ---------------------------------------------------------------- Support

const CATEGORIES = ['question', 'order', 'refund', 'complaint', 'legal', 'other'] as const;
type Category = (typeof CATEGORIES)[number];
const KEYWORDS: Array<[Category, RegExp]> = [
  ['legal', /\b(lawyer|legal action|court|sue|lawsuit)\b|محام|قضية|محكمة/i],
  ['refund', /\b(refund|money back|chargeback|reimburse)\b|استرجاع|استرداد|ارجاع المبلغ|إرجاع المبلغ/i],
  [
    'complaint',
    /\b(complain|complaint|disappointed|unacceptable|terrible|awful|angry)\b|شكوى|سيئ|سيء|غير مقبول|مستاء/i,
  ],
  ['order', /\b(order|license|licence|invoice|receipt|download)\b|طلب|ترخيص|فاتورة|إيصال/i],
];
const URGENT = /\b(urgent|asap|immediately|right now|today)\b|عاجل|فورا|فوراً|حالا|حالاً|اليوم/i;
const ESCALATE: Category[] = ['refund', 'complaint', 'legal'];

/** Support's sorting by fixed rules: the first matching kind wins, in the order of how much it matters. */
export function classify(text: string): { category: Category; urgent: boolean } {
  const hit = KEYWORDS.find(([, pattern]) => pattern.test(text));
  return { category: hit ? hit[0] : 'question', urgent: URGENT.test(text) };
}

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 4),
  );

/** The approved FAQ that shares the most words with the message, when it shares at least two. */
export function matchFaq<T extends { question: Localized; answer: Localized }>(text: string, faqs: T[]): T | null {
  const said = words(text);
  let best: T | null = null;
  let bestHits = 1;
  for (const faq of faqs) {
    const asked = words(`${faq.question.en} ${faq.question.ar}`);
    const hits = [...asked].filter((word) => said.has(word)).length;
    if (hits > bestHits) [best, bestHits] = [faq, hits];
  }
  return best;
}

const triageSchema = z.object({
  category: z.enum(CATEGORIES),
  urgent: z.boolean(),
  escalate: z.boolean(),
  escalation_reason: z.string().max(300),
  reply_subject: z.string().min(1).max(200),
  reply_body: z.string().min(1).max(5000),
  faq_keys: z.array(z.string().max(80)).max(5),
});

async function triage(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('support.triage', ctx, input, async (run) => {
    const message = maybeOne(await rt.db.query<MessageRow>('select * from messages where id = $1', [input.message_id]));
    if (!message || message.direction !== 'in') return { skipped: 'There is no such incoming message.' };
    if (message.handled) return { skipped: 'This message was already handled.' };
    await rt.readOutside(run);
    const text = `${message.subject ?? ''}\n${message.body}`;
    const facts = await companyFacts(rt);
    let { category, urgent } = classify(text);
    let escalate = ESCALATE.includes(category);
    let reason = escalate ? `The customer writes about a ${category}.` : '';
    let reply: { subject: string; body: string } | null = null;
    const evidence: unknown[] = [{ kind: 'message', id: message.id }];

    if (!message.flagged) {
      const written = await rt.think(run, {
        skills: ['inbox-triage'],
        effort: 'low',
        task: `Sort this customer message and draft the answer in ${message.locale === 'ar' ? 'Arabic' : 'English'}. Answer only from the approved FAQs and facts, and say which FAQ keys you used. Say that the reply was prepared by an AI assistant and checked by a person. Escalate refunds, disputes, complaints and legal threats: then the reply only says that a person will answer. Never promise a refund or say anything about an order.`,
        facts,
        outside: { label: `${message.channel} from ${message.from_address ?? 'unknown'}`, content: text },
        schema: triageSchema,
      });
      if (written) {
        ({ category, urgent } = written);
        escalate = written.escalate || ESCALATE.includes(written.category);
        reason = written.escalation_reason || reason;
        reply = { subject: written.reply_subject, body: written.reply_body };
        for (const key of written.faq_keys) evidence.push({ kind: 'memory', id: key });
      }
    }
    if (!reply) {
      const faq = escalate || message.flagged ? null : matchFaq(text, facts.faqs);
      if (faq) evidence.push({ kind: 'memory', id: faq.key });
      try {
        reply = await renderTemplate(rt.db, 'support-received', message.locale, {
          answer: faq ? `${faq.answer[message.locale] || faq.answer.en}\n\n` : '',
        });
      } catch {
        run.notes.push('The support-received template is not approved yet, so no reply was written.');
      }
    }

    if (escalate || urgent)
      await rt.db.query(
        `insert into security_alerts (severity, kind, summary, detail, created_by_kind, created_by_id) values ($1, 'support_escalation', $2, $3::jsonb, 'agent', 'support')`,
        [
          escalate ? 'warning' : 'info',
          `${urgent ? 'Urgent: ' : ''}a customer message needs a person (${category}).`,
          json({ message_id: message.id, reason }),
        ],
      );

    let action: Proposed | null = null;
    const draftOnly = message.flagged || escalate;
    if (reply && message.from_address) {
      if (message.channel === 'whatsapp') {
        if (!draftOnly)
          action = await propose(
            rt,
            run,
            'whatsapp.send_message',
            { to: message.from_address, body: reply.body, locale: message.locale },
            evidence,
            `support.triage:${message.id}`,
          );
        else run.notes.push('A WhatsApp reply has no draft box, so a person should answer this one.');
      } else {
        const payload = { to: message.from_address, subject: reply.subject, body: reply.body, locale: message.locale };
        action = draftOnly
          ? await propose(rt, run, 'gmail.create_draft', payload, evidence, `support.triage:draft:${message.id}`)
          : await propose(rt, run, 'gmail.send_email', payload, evidence, `support.triage:${message.id}`);
      }
    }
    if (message.flagged) run.notes.push('The message tries to give instructions, so only a draft was saved.');
    // Only a prepared reply takes the message off the inbox. Without one, a person still has to answer it.
    if (action) await rt.db.query('update messages set handled = true where id = $1', [message.id]);
    else run.notes.push('No reply was prepared, so the message stays in the inbox for a person.');
    return { message_id: message.id, category, urgent, escalated: escalate, reason, action };
  });
}

/** How many messages one sweep sorts; the rest wait for the next sweep, oldest first. */
const TRIAGE_BATCH = 25;

async function triageInbox(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  const waiting = await rt.db.query<{ id: string }>(
    // A lead's own reply is Sales' to answer (support.lead_answer). A message Support already sorted without a reply
    // is waiting for a person, so it is skipped and never holds the newer ones back; one whose run failed is tried again.
    `select m.id from messages m where m.direction = 'in' and not m.handled and m.lead_id is null and m.channel in ('email', 'whatsapp')
       and not exists (select 1 from agent_runs r where r.workflow = 'support.triage' and r.status = 'succeeded'
                       and r.input ->> 'message_id' = m.id::text)
     order by m.created_at limit $1`,
    [TRIAGE_BATCH],
  );
  const results = [];
  for (const { id } of waiting) results.push(await triage(rt, { message_id: id }, ctx));
  return {
    triaged: results,
    note: waiting.length
      ? waiting.length === TRIAGE_BATCH
        ? 'More are waiting for the next sweep.'
        : null
      : 'The inbox is clear.',
  };
}

// ---------------------------------------------------------------- Marketing

const postsSchema = z.object({
  posts: z
    .array(
      z.object({
        channel: z.enum(['facebook', 'linkedin']),
        locale: z.enum(['en', 'ar']),
        text: z.string().min(1).max(3000),
        based_on: z.array(z.string().max(80)).max(5),
      }),
    )
    .max(7),
});

async function draftPosts(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('marketing.draft_posts', ctx, input, async (run) => {
    const count = Math.min(7, Math.max(1, Number(input.count ?? 3) || 3));
    const topic = typeof input.topic === 'string' ? input.topic.slice(0, 300) : null;
    const facts = await companyFacts(rt);
    if (!facts.packages.length) {
      run.notes.push('There is no approved package text to post about yet. Approve the service packages first.');
      return { drafts: [] };
    }
    const written = await rt.think(run, {
      skills: ['content-calendar'],
      effort: 'medium',
      task: `Draft ${count} social media posts for this week${topic ? ` about: ${topic}` : ''}. Mix Facebook and LinkedIn, and Arabic and English; write each one in its own language, not as a translation. Every claim must come from the approved facts; no testimonials, results or numbers that are not there, no false urgency. Say in based_on which package ids or FAQ keys each post uses.`,
      facts,
      schema: postsSchema,
    });
    const posts =
      written?.posts.slice(0, count) ??
      Array.from({ length: count }, (_, i) => {
        const pkg = facts.packages[i % facts.packages.length]!;
        const locale: Locale = i % 2 === 0 ? 'en' : 'ar';
        const points = pkg.deliverables.map((d) => `• ${d[locale] || d.en}`).join('\n');
        return {
          channel: (i % 2 === 0 ? 'linkedin' : 'facebook') as 'facebook' | 'linkedin',
          locale,
          text: `${pkg.name[locale]}: ${pkg.outcome[locale]}\n\n${points}\n\n${say('Tell us about your project through our website.', 'حدّثنا عن مشروعك عبر موقعنا.', locale)}`,
          based_on: [pkg.id],
        };
      });
    const drafts = [];
    for (const [i, post] of posts.entries())
      drafts.push(
        await propose(
          rt,
          run,
          'buffer.create_draft',
          { channel: post.channel, text: post.text, locale: post.locale },
          post.based_on.map((id) => ({ kind: 'approved_fact', id })),
          `marketing.draft_posts:${run.id}:${i}`,
        ),
      );
    return { drafts };
  });
}

// ---------------------------------------------------------------- Engineering

const issueSchema = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(20_000) });

async function createIssue(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('engineering.create_issue', ctx, input, async (run) => {
    const asked = String(input.details ?? input.title ?? '').slice(0, 2000);
    const title = String(input.title ?? 'New work item').slice(0, 200);
    const written = await rt.think(run, {
      skills: ['release-readiness'],
      effort: 'medium',
      task: `Write a GitHub issue for this request from the owner. Use the sections: Problem, Proposed change, Acceptance criteria, Out of scope, Open questions. Keep it short. Put nothing in it that is private, such as a customer's name, a secret or an internal figure, because the repository may be public. Request: ${asked || title}`,
      schema: issueSchema,
    });
    const issue = written ?? {
      title,
      body: `Asked by the owner in the command center:\n\n> ${asked || title}\n\n## Acceptance criteria\n\nTo be written before work starts.`,
    };
    const repository = await getPolicy(rt.db, 'engineering.repository');
    const isPublic = await getPolicy(rt.db, 'engineering.repository_public');
    const action = await propose(
      rt,
      run,
      'github.create_issue',
      { repository, title: issue.title, body: issue.body, public: isPublic },
      [{ kind: 'command', id: ctx.triggerRef ?? null }],
      `engineering.create_issue:${run.taskId ?? run.id}`,
    );
    return { action };
  });
}

// ---------------------------------------------------------------- Any department, for work no workflow covers

async function openTask(rt: AgentRuntime, input: Json, ctx: WorkflowContext, department: string): Promise<unknown> {
  return rt.record(`${department}.open`, ctx, input, async (run) => {
    const result = await rt.loop(run, {
      instruction: String(input.instruction ?? '').slice(0, 4000),
      effort: 'medium',
      skills: department === 'operations' ? ['command-plan'] : [],
    });
    if (!result) {
      const mode = await rt.mode();
      run.notes.push(
        mode.reason === 'ready' ? 'The AI model could not take this task.' : manualNote(mode.reason),
        'This task needs the AI model: no fixed workflow covers it, so it was skipped.',
      );
      return { skipped: true };
    }
    return result;
  });
}

export const DEPARTMENT_IDS = [
  'operations',
  'engineering',
  'marketing',
  'sales',
  'support',
  'commerce',
  'finance',
  'security',
] as const;

export function registerWorkflows(rt: AgentRuntime): void {
  rt.register('sales.lead_reply', leadReply);
  rt.register('sales.qualify_leads', qualifyLeads);
  rt.register('sales.reply_new_leads', replyNewLeads);
  rt.register('support.triage', triage);
  rt.register('support.triage_inbox', triageInbox);
  rt.register('marketing.draft_posts', draftPosts);
  rt.register('engineering.create_issue', createIssue);
  for (const department of DEPARTMENT_IDS)
    rt.register(`${department}.open`, (inner, input, ctx) => openTask(inner, input, ctx, department));
}
