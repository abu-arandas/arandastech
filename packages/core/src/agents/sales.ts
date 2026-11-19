import { mayPropose } from '../api/mcp';
import { invoicesToRemind, type InvoiceRow, markInvoiceSent, markProposalSent, type ProposalRow } from '../crm/billing';
import type { LeadRow, MessageRow } from '../crm/crm';
import { OPEN_STAGES, SEQUENCES, stopSequence, wantsNoMore } from '../crm/pipeline';
import type { Stage } from '../crm/stages';
import { getPolicy } from '../governance/settings';
import { type Db, json, maybeOne } from '../lib/db';
import { formatMoney } from '../lib/money';
import type { Locale } from '../lib/types';
import { renderTemplate } from '../memory';
import { SALES_LINES, SALES_TEMPLATE_KEYS } from '../sales-templates';
import type { AgentRuntime, Run, WorkflowContext } from './runtime';
import type { Json } from './common';
import type { Proposed } from './workflows';

/**
 * The revenue engine at work (blueprint 5.1): Sales writes the outreach and every follow-up from the approved templates,
 * sends the proposals and invoices the owner makes, reminds clients who have not paid and checks in after delivery.
 * Support reads the answers that come back, stops the emails to anyone who asks, and invites the rest to book a call.
 *
 * Every email is filled in by code from the records and proposed to the gateway with its template's name, so a
 * standing rule the owner made for those templates can send it, and Approvals holds it otherwise.
 */

const DAY = 86_400_000;

async function proposeEmail(
  rt: AgentRuntime,
  run: Run,
  email: { to: string; subject: string; body: string; locale: Locale; template: string; lead_id?: string },
  evidence: unknown[],
  key: string,
  untrusted = false,
): Promise<Proposed> {
  if (!mayPropose(run.department).includes('gmail.send_email'))
    throw new Error(`The ${run.department} department may not send email.`);
  const payload: Json = { ...email };
  if (!email.lead_id) delete payload.lead_id;
  const { action } = await rt.platform.gateway.propose({
    type: 'gmail.send_email',
    payload,
    requester: { kind: 'agent', id: run.department },
    evidence,
    idempotencyKey: key,
    agentRunId: run.id,
    untrustedInput: untrusted || run.untrusted || undefined,
  });
  return {
    action_id: action.id,
    type: action.action_type,
    level: action.level,
    status: action.status,
    summary: action.summary,
  };
}

/** The values every sales email shares, from the policy sheet. */
async function commonValues(rt: AgentRuntime, locale: Locale): Promise<Record<string, string>> {
  const link = await getPolicy(rt.db, 'sales.booking_link');
  return {
    sender: await getPolicy(rt.db, 'sales.sender_name'),
    showcase: await getPolicy(rt.db, 'sales.showcase_link'),
    booking_line: link ? SALES_LINES.booking[locale](link) : SALES_LINES.noBooking[locale],
    opt_out: SALES_LINES.optOut[locale],
  };
}

const leadValues = (lead: LeadRow): Record<string, string> => ({
  name: lead.name,
  company: lead.company ?? lead.name,
});

/** Writes one template, or says that the owner still has to approve it. */
async function write(
  rt: AgentRuntime,
  run: Run,
  template: string,
  locale: Locale,
  values: Record<string, string>,
): Promise<{ subject: string; body: string } | null> {
  try {
    return await renderTemplate(rt.db, template, locale, { ...(await commonValues(rt, locale)), ...values });
  } catch {
    const note = `The ${template} template is not approved yet. Approve it in business memory and Sales sends it.`;
    if (!run.notes.includes(note)) run.notes.push(note);
    return null;
  }
}

async function sentToday(rt: AgentRuntime): Promise<number> {
  const now = rt.platform.clock();
  const [row] = await rt.db.query<{ n: number }>(
    `select count(*)::int as n from actions where action_type = 'gmail.send_email' and created_at > $1
       and payload ->> 'template' = any($2::text[])`,
    [new Date(now.getTime() - DAY), SALES_TEMPLATE_KEYS],
  );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------- The daily sequences

const WAITING = ['proposed', 'pending', 'approved', 'auto_approved', 'executing'];
const REFUSED = ['rejected', 'blocked', 'failed'];

interface SequenceResult {
  proposed: Proposed[];
  waiting: number;
  stopped: number;
  ended: number;
  retried: number;
  reminders: number;
  held_by_limit: number;
}

/** What happened to one lead today. */
type StepOutcome = 'waiting' | 'stopped' | 'ended' | 'held_by_limit' | 'skipped' | Proposed;

/**
 * Each morning: every lead whose next step is due gets its next email proposed, within the daily limit, and unpaid
 * invoices get their reminders. Answers to clients come first, then follow-ups, then first emails.
 */
async function sequences(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('sales.sequences', ctx, input, async (run) => {
    const now = rt.platform.clock();
    // Lapsed approvals are closed first, so their emails can be asked for again today.
    await rt.platform.gateway.expireDue();
    let budget = (await getPolicy(rt.db, 'sales.daily_send_limit')) - (await sentToday(rt));
    const result: SequenceResult = {
      proposed: [],
      waiting: 0,
      stopped: 0,
      ended: 0,
      retried: 0,
      reminders: 0,
      held_by_limit: 0,
    };
    for (const lead of await dueLeads(rt.db, now)) {
      const last = await lastEmail(rt.db, lead);
      if (last === 'waiting') {
        result.waiting += 1;
        continue;
      }
      if (last === 'stopped') {
        await stopSequence(rt.db, lead.id);
        result.stopped += 1;
        continue;
      }
      if (last === 'retry') {
        await retryLastStep(rt.db, lead);
        result.retried += 1;
      }
      const outcome = await nextStep(rt, run, lead, now, budget);
      if (typeof outcome === 'string') {
        if (outcome !== 'skipped') result[outcome] += 1;
        continue;
      }
      result.proposed.push(outcome);
      budget -= 1;
    }
    await remindInvoices(rt, run, now, result);
    if (result.held_by_limit)
      run.notes.push(
        `${result.held_by_limit} emails wait for tomorrow: the daily limit in the policy sheet is reached.`,
      );
    return result;
  });
}

function dueLeads(db: Db, now: Date): Promise<LeadRow[]> {
  return db.query<LeadRow>(
    `select * from leads where next_step_at <= $1 and sequence is not null and not do_not_contact
     order by case when sequence in ('check_in', 'proposal') then 0 when sequence_step > 0 then 1 else 2 end, next_step_at
     limit 200`,
    [now],
  );
}

/**
 * Where the lead's last email stands: still with the owner (waiting), turned down or failed (stopped: Sales never
 * writes again after a no), lapsed before anyone looked (retry: the same email is asked for again), or done (go).
 */
async function lastEmail(db: Db, lead: LeadRow): Promise<'waiting' | 'stopped' | 'retry' | 'go'> {
  if (!lead.last_action_id) return 'go';
  const last = maybeOne(
    await db.query<{ status: string }>('select status from actions where id = $1', [lead.last_action_id]),
  );
  if (!last) return 'go';
  if (WAITING.includes(last.status)) return 'waiting';
  if (REFUSED.includes(last.status)) return 'stopped';
  return last.status === 'expired' ? 'retry' : 'go';
}

async function retryLastStep(db: Db, lead: LeadRow): Promise<void> {
  await db.query(
    'update leads set sequence_step = greatest(0, sequence_step - 1), last_action_id = null where id = $1',
    [lead.id],
  );
  lead.sequence_step = Math.max(0, lead.sequence_step - 1);
}

/** Proposes the lead's next email, or says why there is none today. */
async function nextStep(rt: AgentRuntime, run: Run, lead: LeadRow, now: Date, budget: number): Promise<StepOutcome> {
  const spec = SEQUENCES[lead.sequence!];
  const outreach = lead.sequence!.startsWith('outreach') || lead.sequence === 'inbound';
  if (!spec || (outreach && !OPEN_STAGES.includes(lead.stage))) {
    await stopSequence(rt.db, lead.id);
    return 'stopped';
  }
  if (lead.sequence_step >= spec.steps.length) {
    await endSequence(rt.db, lead, spec.end);
    return 'ended';
  }
  if (budget <= 0) return 'held_by_limit';
  const values = await stepValues(rt, lead);
  if (!values) {
    await stopSequence(rt.db, lead.id);
    return 'stopped';
  }
  const step = spec.steps[lead.sequence_step]!;
  const text = await write(rt, run, step.template, lead.locale, values);
  if (!text) return 'skipped';
  const action = await proposeEmail(
    rt,
    run,
    { to: lead.email, ...text, locale: lead.locale, template: step.template, lead_id: lead.id },
    [
      { kind: 'lead', id: lead.id },
      { kind: 'memory', id: `template:${step.template}` },
    ],
    `sales.sequence:${lead.id}:${lead.sequence}:${lead.sequence_step}:${now.toISOString().slice(0, 10)}`,
    // A website lead's name was typed by an outsider, so its emails always wait for the owner.
    lead.kind !== 'prospect' && lead.sequence !== 'check_in',
  );
  await rt.db.query(
    `update leads set sequence_step = sequence_step + 1, last_action_id = $2, last_contact_at = $3,
       next_step_at = $4, stage = case when stage = 'new' then 'contacted' else stage end where id = $1`,
    [lead.id, action.action_id, now, new Date(now.getTime() + Math.max(1, step.waitDays) * DAY)],
  );
  return action;
}

/** The sequence is over: the lead moves to its end stage (an outreach with no reply is lost). */
async function endSequence(db: Db, lead: LeadRow, end: Stage | null): Promise<void> {
  await db.query(
    `update leads set sequence = null, next_step_at = null,
       stage = case when $2::text is not null and ($2 <> 'lost' or stage in ('new', 'contacted')) then $2 else stage end,
       notes = case when $2 = 'lost' then trim(notes || E'\\nNo reply to the outreach.') else notes end
     where id = $1`,
    [lead.id, end],
  );
}

/** The values for the lead's next email; a proposal reminder also needs the proposal, and stops without one. */
async function stepValues(rt: AgentRuntime, lead: LeadRow): Promise<Record<string, string> | null> {
  const values = leadValues(lead);
  if (lead.sequence !== 'proposal') return values;
  const proposal = maybeOne(
    await rt.db.query<ProposalRow>(
      `select * from proposals where lead_id = $1 and status = 'sent' order by sent_at desc limit 1`,
      [lead.id],
    ),
  );
  return proposal ? { ...values, ...proposalValues(rt, proposal) } : null;
}

async function remindInvoices(rt: AgentRuntime, run: Run, now: Date, result: SequenceResult): Promise<void> {
  for (const invoice of await invoicesToRemind(rt.db, now)) {
    const text = await write(rt, run, 'invoice-reminder', invoice.locale, invoiceValues(rt, invoice));
    if (!text) return;
    const action = await proposeEmail(
      rt,
      run,
      {
        to: invoice.buyer_email!,
        ...text,
        locale: invoice.locale,
        template: 'invoice-reminder',
        lead_id: invoice.lead_id ?? undefined,
      },
      [{ kind: 'invoice', id: invoice.id }],
      `sales.invoice_reminder:${invoice.id}:${invoice.reminders_sent}`,
    );
    await rt.db.query('update invoices set reminders_sent = reminders_sent + 1 where id = $1', [invoice.id]);
    result.proposed.push(action);
    result.reminders += 1;
  }
}

// ---------------------------------------------------------------- Proposals, invoices and receipts

function proposalValues(rt: AgentRuntime, p: ProposalRow): Record<string, string> {
  const site = rt.platform.config.siteUrl ?? 'http://localhost:3000';
  return {
    number: p.number,
    title: p.title,
    total: formatMoney(Number(p.total_minor), p.currency),
    valid_until: p.valid_until,
    link: `${site}/${p.locale}/p/${p.public_token}`,
  };
}

function invoiceValues(rt: AgentRuntime, i: InvoiceRow): Record<string, string> {
  const site = rt.platform.config.siteUrl ?? 'http://localhost:3000';
  return {
    name: i.buyer_name,
    number: i.number,
    title: i.title,
    total: formatMoney(Number(i.total_minor), i.currency),
    due: i.due_on,
    link: `${site}/${i.locale}/i/${i.public_token}`,
  };
}

async function sendDocument(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('sales.send_document', ctx, input, async (run) => {
    const now = rt.platform.clock();
    if (input.kind === 'proposal') {
      const proposal = maybeOne(await rt.db.query<ProposalRow>('select * from proposals where id = $1', [input.id]));
      if (!proposal || !['draft', 'sent'].includes(proposal.status)) return { skipped: 'The proposal is not open.' };
      const lead = maybeOne(await rt.db.query<LeadRow>('select * from leads where id = $1', [proposal.lead_id]))!;
      const text = await write(rt, run, 'proposal', proposal.locale, {
        ...leadValues(lead),
        ...proposalValues(rt, proposal),
      });
      if (!text) return { skipped: 'The proposal template is not approved yet.' };
      const action = await proposeEmail(
        rt,
        run,
        { to: lead.email, ...text, locale: proposal.locale, template: 'proposal', lead_id: lead.id },
        [{ kind: 'proposal', id: proposal.id }],
        `sales.send_proposal:${proposal.id}`,
      );
      await markProposalSent(rt.db, proposal, now);
      return { action };
    }
    const invoice = maybeOne(await rt.db.query<InvoiceRow>('select * from invoices where id = $1', [input.id]));
    if (!invoice || !invoice.buyer_email) return { skipped: 'The invoice has no email address.' };
    const receipt = input.kind === 'receipt';
    if (receipt ? invoice.status !== 'paid' : !['draft', 'sent'].includes(invoice.status))
      return { skipped: `The invoice is ${invoice.status}.` };
    const template = receipt ? 'payment-received' : 'invoice';
    const text = await write(rt, run, template, invoice.locale, invoiceValues(rt, invoice));
    if (!text) return { skipped: `The ${template} template is not approved yet.` };
    const action = await proposeEmail(
      rt,
      run,
      { to: invoice.buyer_email, ...text, locale: invoice.locale, template, lead_id: invoice.lead_id ?? undefined },
      [{ kind: 'invoice', id: invoice.id }],
      `sales.${template}:${invoice.id}`,
    );
    if (!receipt) await markInvoiceSent(rt.db, invoice.id, now);
    return { action };
  });
}

// ---------------------------------------------------------------- A lead writes back

async function leadAnswer(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('support.lead_answer', ctx, input, async (run) => {
    const message = maybeOne(await rt.db.query<MessageRow>('select * from messages where id = $1', [input.message_id]));
    if (!message?.lead_id || message.handled) return { skipped: 'There is no unanswered reply from a lead.' };
    const lead = maybeOne(await rt.db.query<LeadRow>('select * from leads where id = $1', [message.lead_id]))!;
    await rt.readOutside(run);
    const who = lead.company ? `${lead.name} (${lead.company})` : lead.name;
    const alert = async (kind: string, summary: string): Promise<void> => {
      await rt.db.query(
        `insert into security_alerts (severity, kind, summary, detail, created_by_kind, created_by_id) values ('info', $1, $2, $3::jsonb, 'agent', 'support')`,
        [kind, summary, json({ lead_id: lead.id, message_id: message.id })],
      );
    };
    if (wantsNoMore(`${message.subject ?? ''}\n${message.body}`)) {
      await rt.db.query(
        `update leads set do_not_contact = true, sequence = null, next_step_at = null,
           stage = case when stage = any($2::text[]) then 'lost' else stage end,
           notes = trim(notes || E'\\nAsked not to be contacted again.') where id = $1`,
        [lead.id, OPEN_STAGES],
      );
      await rt.db.query('update messages set handled = true where id = $1', [message.id]);
      await alert('lead_opted_out', `${who} asked not to be emailed again. Nothing more will be sent to them.`);
      return { opted_out: true };
    }
    await alert('lead_replied', `${who} replied. Read it in the inbox.`);
    // A first answer gets the booking link. Later in the deal, a person answers.
    if (message.flagged || !['new', 'contacted', 'replied'].includes(lead.stage)) {
      run.notes.push('The reply needs a person, so it stays in the inbox.');
      return { invited: false };
    }
    const text = await write(rt, run, 'meeting-invite', lead.locale, leadValues(lead));
    if (!text) return { invited: false };
    const action = await proposeEmail(
      rt,
      run,
      { to: lead.email, ...text, locale: lead.locale, template: 'meeting-invite', lead_id: lead.id },
      [{ kind: 'message', id: message.id }],
      `support.lead_answer:${message.id}`,
      true,
    );
    await rt.db.query('update messages set handled = true where id = $1', [message.id]);
    return { invited: true, action };
  });
}

export function registerSalesWorkflows(rt: AgentRuntime): void {
  rt.register('sales.sequences', sequences);
  rt.register('sales.send_document', sendDocument);
  rt.register('support.lead_answer', leadAnswer);
}
