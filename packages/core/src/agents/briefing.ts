import { z } from 'zod';
import { ledgerCurrencies, moneySummary } from '../finance/ledger';
import { revenueStatus } from '../crm/revenue';
import { listOpenApprovals } from '../governance/approvals';
import { formatMoney } from '../lib/money';
import type { Locale } from '../lib/types';
import { AWAITING_REPLY, type Json, say } from './common';
import type { AgentRuntime, WorkflowContext } from './runtime';

/**
 * Operations' morning briefing and Finance's money status. Every figure is counted by code from the records and the
 * books; a model may only put them into words, and its text is dropped when it carries a number that is not there.
 */

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

/** The month against the revenue goal, in whole dollars, and what Sales did toward it (blueprint 5.1). */
async function salesFigures(rt: AgentRuntime, now: Date) {
  const r = await revenueStatus(rt.db, now);
  const dollars = (cents: number): string => formatMoney(cents, 'USD');
  return {
    goal: dollars(r.goal_usd_cents),
    collected: dollars(r.collected_usd_cents),
    on_track: r.on_track,
    days_left: r.days_left,
    deals_needed: r.deals_needed,
    month: r.this_month,
    follow_ups_due: r.follow_ups_due,
    prospects_waiting: r.prospects_waiting,
  };
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
      `select count(*) filter (where l.created_at > $1)::int as new_today,
              count(*) filter (where ${AWAITING_REPLY})::int as waiting_reply,
              count(*) filter (where l.stage = 'qualified')::int as qualified from leads l where l.kind = 'inbound'`,
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
    sales: await salesFigures(rt, now),
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
          `- هدف الشهر: ${f.sales.collected} من ${f.sales.goal}، ${f.sales.on_track ? 'على الوتيرة' : 'متأخرون عن الوتيرة'}، وباقي ${f.sales.days_left} يوماً. صفقات ما زلنا نحتاجها: ${f.sales.deals_needed}.`,
          `- المبيعات هذا الشهر: ${f.sales.month.first_emails} رسالة أولى، و${f.sales.month.follow_ups} متابعة، و${f.sales.month.replies} رداً، و${f.sales.month.meetings} اجتماعاً، و${f.sales.month.proposals} عرضاً، و${f.sales.month.won} صفقة رابحة.`,
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
          `- Monthly goal: ${f.sales.collected} of ${f.sales.goal}, ${f.sales.on_track ? 'on track' : 'behind the pace'}, ${f.sales.days_left} days left. Deals still needed: ${f.sales.deals_needed}.`,
          `- Sales this month: ${f.sales.month.first_emails} first emails, ${f.sales.month.follow_ups} follow-ups, ${f.sales.month.replies} replies, ${f.sales.month.meetings} meetings, ${f.sales.month.proposals} proposals, ${f.sales.month.won} won.`,
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
      task: 'Write the owner a short daily briefing from these figures, once in English and once in Arabic. Lead with what needs the owner today, then where the month stands against the revenue goal and what Sales did toward it. Use only these figures and never add a number. Say plainly what failed or is blocked. At most 170 words each.',
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

export function registerBriefingWorkflows(rt: AgentRuntime): void {
  rt.register('operations.daily_briefing', dailyBriefing);
  rt.register('finance.money_status', moneyStatus);
}
