import { z } from 'zod';
import { mayPropose } from '../api/mcp';
import { listLeads, type LeadRow, type MessageRow, updateLead } from '../crm/crm';
import { startSequence } from '../crm/pipeline';
import { ledgerCurrencies, moneySummary } from '../finance/ledger';
import { minimumPrice } from '../finance/pricing';
import { listOpenApprovals } from '../governance/approvals';
import { pause } from '../governance/pause';
import { getPolicy } from '../governance/settings';
import { json, maybeOne } from '../lib/db';
import { formatMoney } from '../lib/money';
import type { Locale, Localized } from '../lib/types';
import { listApprovedMemory, renderTemplate } from '../memory';
import { type AgentRuntime, manualNote, type Run, type WorkflowContext } from './runtime';

/**
 * What each department does on its own (blueprint 7.3). Every workflow works without an AI model: Sales answers
 * from an approved template and scores by fixed rules, Support matches the approved FAQs, Operations and Finance
 * report figures calculated by code. With a model, the same workflow lets it write the text, and code still checks the
 * result, takes the figures from the books and sends every proposal through the gateway.
 */

type Json = Record<string, unknown>;

export interface Proposed {
  action_id: string;
  type: string;
  level: number;
  status: string;
  summary: string;
}

export async function propose(
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

const say = (en: string, ar: string, locale: Locale): string => (locale === 'ar' ? ar : en);

// ---------------------------------------------------------------- Sales

const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|proton|protonmail|mail)\./i;
const PLANS =
  /\b(deadline|budget|launch|week|month|quote|timeline|start)\b|\$|jod|usd|ميزاني|موعد|أسبوع|اسبوع|شهر|إطلاق|اطلاق|دينار|نبدأ|سعر/i;

/** The lead score from fixed rules, with the reasons, so the owner can see why (blueprint 7.3 Sales: approved criteria). */
export function scoreLead(
  lead: Pick<LeadRow, 'email' | 'phone' | 'package_id' | 'message'>,
  flagged: boolean,
): {
  score: number;
  reasons: string[];
} {
  if (flagged) return { score: 0, reasons: ['The message tries to give instructions, so it is not scored.'] };
  let score = 20;
  const reasons: string[] = [];
  const add = (points: number, reason: string): void => {
    score += points;
    reasons.push(`+${points}: ${reason}`);
  };
  if (lead.package_id) add(20, 'chose a package');
  if (lead.message.trim().length >= 120) add(15, 'described the work in detail');
  if (PLANS.test(lead.message)) add(15, 'mentions a timeline, a budget or a start');
  if (!FREE_MAIL.test(lead.email)) add(15, 'writes from a company address');
  if (lead.phone) add(10, 'left a phone number');
  return { score: Math.min(100, score), reasons };
}

const QUALIFIED = 60;

const leadReplySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  score: z.number().int().min(0).max(100),
  score_reasons: z.array(z.string().max(200)).max(6),
  assumptions: z.array(z.string().max(300)).max(6),
});

async function leadReply(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('sales.lead_reply', ctx, input, async (run) => {
    const lead = maybeOne(await rt.db.query<LeadRow>('select * from leads where id = $1', [input.lead_id]));
    if (!lead) return { skipped: 'The lead no longer exists.' };
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
    if (!flagged) {
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
        scored = { score: written.score, reasons: written.score_reasons };
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
    const leads = (await listLeads(rt.db)).filter((lead) => ['new', 'qualified'].includes(lead.stage));
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
      const { score, reasons } = scoreLead(lead, flagged.has(lead.id));
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
    `select l.id from leads l where l.stage in ('new', 'qualified')
       and not exists (select 1 from actions a where a.payload ->> 'lead_id' = l.id::text and a.action_type in ('gmail.send_email', 'gmail.create_draft'))
     order by l.created_at limit 5`,
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

async function triageInbox(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  const waiting = await rt.db.query<{ id: string }>(
    `select id from messages where direction = 'in' and not handled and channel in ('email', 'whatsapp') order by created_at limit 10`,
  );
  const results = [];
  for (const { id } of waiting) results.push(await triage(rt, { message_id: id }, ctx));
  return { triaged: results, note: waiting.length ? null : 'The inbox is clear.' };
}

// ---------------------------------------------------------------- Operations and Finance: figures from the books

async function moneyFigures(rt: AgentRuntime) {
  const now = rt.platform.clock();
  const currencies = [...new Set(['USD', 'JOD', ...(await ledgerCurrencies(rt.db))])];
  const summaries = await Promise.all(currencies.map((currency) => moneySummary(rt.db, currency, now)));
  return summaries.map((s) => ({
    currency: s.currency,
    status: s.status,
    reasons: s.reasons,
    pending: formatMoney(s.pending_revenue, s.currency),
    settled_balance: formatMoney(s.waterfall.settled_balance, s.currency),
    reserve: formatMoney(s.waterfall.refund_and_dispute_reserve, s.currency),
    available: formatMoney(s.waterfall.available_cash, s.currency),
    profit: formatMoney(s.waterfall.confirmed_net_profit, s.currency),
    open_disputes: s.open_disputes,
  }));
}

async function businessFigures(rt: AgentRuntime) {
  const now = rt.platform.clock();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await rt.db.query<T>(sql, params))[0] as T;
  const open = await listOpenApprovals(rt.db, now);
  const mode = await rt.mode();
  return {
    date: now.toISOString().slice(0, 10),
    approvals: {
      waiting: open.length,
      level_3: open.filter((r) => r.level === 3).length,
      next_lapses_at:
        open
          .map((r) => r.expires_at)
          .sort((a, b) => a.getTime() - b.getTime())[0]
          ?.toISOString() ?? null,
    },
    leads: await one<{ new_today: number; waiting_reply: number; qualified: number }>(
      `select count(*) filter (where created_at > $1)::int as new_today,
              count(*) filter (where stage = 'new')::int as waiting_reply,
              count(*) filter (where stage = 'qualified')::int as qualified from leads`,
      [dayAgo],
    ),
    orders: await one<{ in_progress: number; on_hold: number; paid_today: number }>(
      `select count(*) filter (where status in ('paid', 'fulfilling', 'shipped'))::int as in_progress,
              count(*) filter (where status = 'on_hold')::int as on_hold,
              count(*) filter (where paid_at > $1)::int as paid_today from orders`,
      [dayAgo],
    ),
    inbox: await one<{ unhandled: number; flagged: number }>(
      `select count(*) filter (where not handled and channel in ('email', 'whatsapp'))::int as unhandled,
              count(*) filter (where flagged and created_at > $1)::int as flagged
       from messages where direction = 'in'`,
      [dayAgo],
    ),
    alerts_open: (await one<{ n: number }>(`select count(*)::int as n from security_alerts where status = 'open'`)).n,
    actions: await one<{ failed: number; held: number; done: number }>(
      `select count(*) filter (where status = 'failed' and created_at > $1)::int as failed,
              count(*) filter (where status in ('approved', 'auto_approved') and held_reason is not null)::int as held,
              count(*) filter (where status = 'executed' and executed_at > $1)::int as done from actions`,
      [dayAgo],
    ),
    agents: {
      ...(await one<{ runs: number; failed: number }>(
        `select count(*)::int as runs, count(*) filter (where status = 'failed')::int as failed from agent_runs
         where started_at > $1 and workflow <> 'read_outside_content'`,
        [dayAgo],
      )),
      mode: mode.mode,
      ai_spent_today: `${(mode.spent_today_micros / 1_000_000).toFixed(2)} USD`,
    },
    money: await moneyFigures(rt),
  };
}

type Figures = Awaited<ReturnType<typeof businessFigures>>;

/** The briefing in fixed sentences: what manual mode says, and the check on what a model wrote. */
export function briefingText(f: Figures, locale: Locale): string {
  const money = f.money
    .filter((m) => m.pending !== formatMoney(0, m.currency) || m.settled_balance !== formatMoney(0, m.currency))
    .map((m) =>
      say(
        `- Money in ${m.currency}: ${m.available} available, ${m.pending} still pending, spend status ${m.status}.`,
        `- المال بعملة ${m.currency}: ${m.available} متاح، و${m.pending} ما زال معلّقاً، وحالة الإنفاق ${m.status}.`,
        locale,
      ),
    );
  const lines =
    locale === 'ar'
      ? [
          `ملخص يوم ${f.date}.`,
          `- طلبات موافقة بانتظارك: ${f.approvals.waiting}، منها ${f.approvals.level_3} من المستوى 3.`,
          `- عملاء محتملون جدد خلال آخر يوم: ${f.leads.new_today}. بانتظار أول رد: ${f.leads.waiting_reply}. مؤهَّلون: ${f.leads.qualified}.`,
          `- الطلبات: ${f.orders.in_progress} قيد التنفيذ، و${f.orders.on_hold} موقوفة، و${f.orders.paid_today} دُفعت خلال آخر يوم.`,
          `- صندوق الرسائل: ${f.inbox.unhandled} بلا معالجة، و${f.inbox.flagged} رسالة حاولت إعطاء أوامر خلال آخر يوم.`,
          `- تنبيهات مفتوحة: ${f.alerts_open}. إجراءات فشلت خلال آخر يوم: ${f.actions.failed}. إجراءات يوقفها الإيقاف المؤقت: ${f.actions.held}.`,
          ...money,
          `- الأقسام: ${f.agents.runs} تشغيلاً خلال آخر يوم، فشل منها ${f.agents.failed}. ${f.agents.mode === 'ai' ? 'تعمل بالذكاء الاصطناعي' : 'تعمل يدوياً بلا ذكاء اصطناعي'}، وتكلفة اليوم ${f.agents.ai_spent_today}.`,
        ]
      : [
          `Briefing for ${f.date}.`,
          `- Approvals waiting for you: ${f.approvals.waiting}, of which ${f.approvals.level_3} at Level 3.`,
          `- New leads in the last day: ${f.leads.new_today}. Waiting for a first reply: ${f.leads.waiting_reply}. Qualified: ${f.leads.qualified}.`,
          `- Orders: ${f.orders.in_progress} in progress, ${f.orders.on_hold} on hold, ${f.orders.paid_today} paid in the last day.`,
          `- Inbox: ${f.inbox.unhandled} not handled, ${f.inbox.flagged} that tried to give instructions in the last day.`,
          `- Open alerts: ${f.alerts_open}. Actions that failed in the last day: ${f.actions.failed}. Held by a pause: ${f.actions.held}.`,
          ...money,
          `- Departments: ${f.agents.runs} runs in the last day, ${f.agents.failed} failed. ${f.agents.mode === 'ai' ? 'Working with AI' : 'Working in manual mode, without AI'}; spent today ${f.agents.ai_spent_today}.`,
        ];
  return lines.join('\n');
}

/** True when every number of two or more digits in a model's text is one of the figures, so none was invented. */
export function onlyKnownNumbers(text: string, figures: unknown): boolean {
  const known = new Set(JSON.stringify(figures).match(/\d+(?:\.\d+)?/g) ?? []);
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).every((n) => known.has(n.replace(/,/g, '')));
}

const textPairSchema = z.object({ en: z.string().min(1).max(3000), ar: z.string().min(1).max(3000) });

async function dailyBriefing(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('operations.daily_briefing', ctx, input, async (run) => {
    const figures = await businessFigures(rt);
    const written = await rt.think(run, {
      skills: ['daily-briefing'],
      effort: 'low',
      task: 'Write the owner a short daily briefing from these figures, once in English and once in Arabic. Lead with what needs the owner today. Use only these figures and never add a number. Say plainly what failed or is blocked. At most 150 words each.',
      facts: figures,
      schema: textPairSchema,
    });
    let text = { en: briefingText(figures, 'en'), ar: briefingText(figures, 'ar') };
    if (written && onlyKnownNumbers(`${written.en}\n${written.ar}`, figures)) text = written;
    else if (written)
      run.notes.push('The AI briefing used a number that is not in the books, so the plain one is shown.');
    return { text, figures };
  });
}

async function moneyStatus(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('finance.money_status', ctx, input, async (run) => {
    const money = await moneyFigures(rt);
    const plain = (locale: Locale): string =>
      money
        .map((m) =>
          say(
            `${m.currency}: ${m.available} available after reserves, ${m.pending} pending (not money yet), confirmed profit ${m.profit}. Spend status: ${m.status}.`,
            `${m.currency}: ${m.available} متاح بعد الاحتياطي، و${m.pending} معلّق (ليس مالاً بعد)، وصافي الربح المؤكد ${m.profit}. حالة الإنفاق: ${m.status}.`,
            locale,
          ),
        )
        .join('\n');
    const written = await rt.think(run, {
      skills: ['money-status'],
      effort: 'low',
      task: 'Explain these figures to the owner in plain words, once in English and once in Arabic: what money is really available, what is still pending and why it is not money yet. Never add a number. At most 120 words each.',
      facts: money,
      schema: textPairSchema,
    });
    let text = { en: plain('en'), ar: plain('ar') };
    if (written && onlyKnownNumbers(`${written.en}\n${written.ar}`, money)) text = written;
    else if (written) run.notes.push('The AI text used a number that is not in the books, so the plain one is shown.');
    return { text, money, source: 'ledger_entries, calculated by code' };
  });
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

// ---------------------------------------------------------------- Commerce

async function catalogCheck(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('commerce.catalog_check', ctx, input, async () => {
    const variants = await rt.db.query<{
      sku: string;
      name: Localized;
      price_minor: number;
      currency: string;
      unit_cost_minor: number;
    }>(
      `select v.sku, p.name, v.price_minor, v.currency, v.unit_cost_minor from product_variants v join products p on p.id = v.product_id
       where p.status = 'published' order by v.sku`,
    );
    const floorBps = await getPolicy(rt.db, 'margin.min_product_bps');
    const feeBps = await getPolicy(rt.db, 'pricing.payment_fee_bps');
    const fixed = await getPolicy(rt.db, 'pricing.payment_fee_fixed_minor');
    const advertisingBps = await getPolicy(rt.db, 'pricing.advertising_bps');
    const refundBps = await getPolicy(rt.db, 'pricing.refund_allowance_bps');
    const checked = variants.map((v) => {
      const floor = minimumPrice(
        {
          unitCostMinor: Number(v.unit_cost_minor),
          fixedFeeMinor: fixed[v.currency] ?? 0,
          feeBps,
          advertisingBps,
          refundBps,
        },
        floorBps,
      );
      return {
        sku: v.sku,
        name: v.name.en,
        price: formatMoney(Number(v.price_minor), v.currency),
        floor: floor === null ? null : formatMoney(floor, v.currency),
        below_floor: floor === null || Number(v.price_minor) < floor,
      };
    });
    return {
      checked,
      below_floor: checked.filter((v) => v.below_floor).map((v) => v.sku),
      source: 'product_variants and the policy sheet, calculated by code',
    };
  });
}

// ---------------------------------------------------------------- Security

async function securityReview(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('security.review', ctx, input, async (run) => {
    const now = rt.platform.clock();
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const findings: string[] = [];
    const [{ flagged }] = (await rt.db.query<{ flagged: number }>(
      `select count(*)::int as flagged from messages where flagged and created_at > $1`,
      [dayAgo],
    )) as [{ flagged: number }];
    if (flagged >= 3) {
      findings.push(`${flagged} messages tried to give instructions in the last day.`);
      const already = await rt.db.query(
        `select 1 from security_alerts where kind = 'repeated_manipulation' and created_at > $1`,
        [dayAgo],
      );
      if (!already.length)
        await rt.db.query(
          `insert into security_alerts (severity, kind, summary, detail, created_by_kind, created_by_id) values ('warning', 'repeated_manipulation', $1, $2::jsonb, 'agent', 'security')`,
          [`${flagged} messages tried to give the bots instructions in one day.`, json({ since: dayAgo })],
        );
    }
    // A connector that keeps failing is paused, so it cannot fail customers again. Only the owner can end the pause.
    const failing = await rt.db.query<{ connector: string; n: number }>(
      `select connector, count(*)::int as n from actions where status = 'failed' and created_at > $1 group by connector having count(*) >= 5`,
      [hourAgo],
    );
    for (const { connector, n } of failing) {
      await pause(
        rt.db,
        { scope: 'connector', target: connector },
        `Security paused it: ${n} actions failed in the last hour.`,
        { kind: 'agent', id: 'security' },
      );
      findings.push(`Paused the ${connector} connector after ${n} failures in the last hour.`);
    }
    const [{ blocked }] = (await rt.db.query<{ blocked: number }>(
      `select count(*)::int as blocked from actions where status = 'blocked' and created_at > $1`,
      [dayAgo],
    )) as [{ blocked: number }];
    if (blocked) findings.push(`The policy engine blocked ${blocked} proposed actions in the last day.`);
    const [{ critical }] = (await rt.db.query<{ critical: number }>(
      `select count(*)::int as critical from security_alerts where status = 'open' and severity = 'critical'`,
    )) as [{ critical: number }];
    if (critical) findings.push(`${critical} critical alerts are open.`);
    if (!findings.length) run.notes.push('Nothing unusual in the last day.');
    return { findings };
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
  rt.register('operations.daily_briefing', dailyBriefing);
  rt.register('finance.money_status', moneyStatus);
  rt.register('marketing.draft_posts', draftPosts);
  rt.register('engineering.create_issue', createIssue);
  rt.register('commerce.catalog_check', catalogCheck);
  rt.register('security.review', securityReview);
  for (const department of DEPARTMENT_IDS)
    rt.register(`${department}.open`, (inner, input, ctx) => openTask(inner, input, ctx, department));
}
