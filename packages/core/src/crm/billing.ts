import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { enqueue } from '../agents/jobs';
import { post } from '../finance/ledger';
import { audit } from '../governance/audit';
import { getPolicy } from '../governance/settings';
import { type Db, json, maybeOne, one } from '../lib/db';
import { AppError, invalid, notFound } from '../lib/errors';
import { shareOf, toMinor } from '../lib/money';
import type { Actor, Locale } from '../lib/types';
import type { LeadRow } from './crm';
import { startSequence, stopSequence } from './pipeline';

/**
 * Proposals and invoices (blueprint 5.1, steps 7 to 10). The owner writes a proposal; the client reads and accepts it
 * by its secret link; accepting it raises the deposit invoice; the owner marks an invoice paid once the money is in the
 * bank, which posts it to the services books. Every email about them is proposed by Sales to the gateway.
 */

interface Item {
  description: string;
  amount_minor: number;
}

export interface ProposalRow {
  id: string;
  number: string;
  lead_id: string;
  package_id: string | null;
  title: string;
  items: Item[];
  total_minor: number;
  currency: string;
  deposit_bps: number;
  notes: string;
  locale: Locale;
  valid_until: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  public_token: string;
  accepted_by: string | null;
  created_at: Date;
  sent_at: Date | null;
  decided_at: Date | null;
}

export interface InvoiceRow {
  id: string;
  number: string;
  lead_id: string | null;
  proposal_id: string | null;
  title: string;
  items: Item[];
  total_minor: number;
  currency: string;
  buyer_name: string;
  buyer_email: string | null;
  locale: Locale;
  due_on: string;
  status: 'draft' | 'sent' | 'paid' | 'void';
  public_token: string;
  paid_at: Date | null;
  paid_via: string | null;
  reminders_sent: number;
  created_at: Date;
  sent_at: Date | null;
}

const token = (): string => randomBytes(18).toString('base64url');
const day = (at: Date, plusDays = 0): string =>
  new Date(at.getTime() + plusDays * 86_400_000).toISOString().slice(0, 10);
const currency = z.enum(['USD', 'JOD', 'EUR']);
const items = z
  .array(z.strictObject({ description: z.string().trim().min(1).max(300), amount: z.string().trim().max(20) }))
  .min(1)
  .max(20);

function parse<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw invalid(
      `The ${what} is not complete.`,
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    );
  return result.data;
}

function priced(list: Array<{ description: string; amount: string }>, code: string): { items: Item[]; total: number } {
  const out = list.map((item) => {
    const amount = toMinor(item.amount, code);
    if (amount <= 0) throw invalid('every line needs an amount above zero');
    return { description: item.description, amount_minor: amount };
  });
  return { items: out, total: out.reduce((sum, item) => sum + item.amount_minor, 0) };
}

async function leadOf(db: Db, leadId: string): Promise<LeadRow> {
  const lead = maybeOne(await db.query<LeadRow>('select * from leads where id = $1', [leadId]));
  if (!lead) throw notFound('lead');
  return lead;
}

// ---------------------------------------------------------------- Proposals

const proposalInput = z.strictObject({
  lead_id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  items,
  currency: currency.default('USD'),
  package_id: z.string().max(80).optional(),
  /** Share invoiced on acceptance, as a percentage. The policy sheet's deposit when left out. */
  deposit_percent: z.number().int().min(0).max(100).optional(),
  valid_days: z.number().int().min(1).max(90).default(14),
  notes: z.string().trim().max(4000).default(''),
});

export async function createProposal(db: Db, raw: unknown, by: Actor, now: Date): Promise<ProposalRow> {
  const input = parse(proposalInput, raw, 'proposal');
  const lead = await leadOf(db, input.lead_id);
  const { items: lines, total } = priced(input.items, input.currency);
  const deposit =
    input.deposit_percent === undefined ? await getPolicy(db, 'billing.deposit_bps') : input.deposit_percent * 100;
  return db.tx(async (tx) => {
    const proposal = one(
      await tx.query<ProposalRow>(
        `insert into proposals (number, lead_id, package_id, title, items, total_minor, currency, deposit_bps, notes, locale,
           valid_until, public_token, created_at)
         values ('Q-' || to_char($12::timestamptz, 'YYYY') || '-' || lpad(nextval('proposal_number_seq')::text, 4, '0'),
           $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
        [
          lead.id,
          input.package_id ?? null,
          input.title,
          json(lines),
          total,
          input.currency,
          deposit,
          input.notes,
          lead.locale,
          day(now, input.valid_days),
          token(),
          now,
        ],
      ),
    );
    await audit(tx, {
      actor: by,
      type: 'proposal.created',
      subject: { type: 'proposal', id: proposal.id },
      data: { number: proposal.number, total_minor: total, currency: input.currency },
    });
    return proposal;
  });
}

/** Asks Sales to email the proposal. The email waits in Approvals unless a standing rule covers it. */
export async function sendProposal(db: Db, proposalId: string, by: Actor): Promise<void> {
  const proposal = maybeOne(await db.query<ProposalRow>('select * from proposals where id = $1', [proposalId]));
  if (!proposal) throw notFound('proposal');
  if (!['draft', 'sent'].includes(proposal.status)) throw invalid(`the proposal is ${proposal.status}`);
  await enqueue(
    db,
    'sales.send_document',
    { kind: 'proposal', id: proposal.id },
    { key: `send:proposal:${proposal.id}` },
  );
  await audit(db, { actor: by, type: 'proposal.send_asked', subject: { type: 'proposal', id: proposal.id } });
}

/** Called once the email is proposed: the lead is now waiting on a proposal, and gets one reminder. */
export async function markProposalSent(db: Db, proposal: ProposalRow, now: Date): Promise<void> {
  await db.query(
    `update proposals set status = 'sent', sent_at = coalesce(sent_at, $2) where id = $1 and status = 'draft'`,
    [proposal.id, now],
  );
  await db.query(`update leads set stage = 'proposal_sent' where id = $1 and stage = any($2::text[])`, [
    proposal.lead_id,
    ['new', 'contacted', 'replied', 'meeting', 'qualified'],
  ]);
  await startSequence(db, proposal.lead_id, 'proposal', now);
}

export interface PublicProposal {
  number: string;
  title: string;
  client: string;
  items: Item[];
  total_minor: number;
  currency: string;
  deposit_minor: number;
  notes: string;
  locale: Locale;
  valid_until: string;
  status: ProposalRow['status'];
}

async function byToken(db: Db, secret: string): Promise<ProposalRow> {
  const proposal = maybeOne(
    await db.query<ProposalRow>(`select * from proposals where public_token = $1 and status <> 'draft'`, [secret]),
  );
  if (!proposal) throw notFound('proposal');
  return proposal;
}

/** What the client sees by the secret link: the proposal and nothing else about the company or other clients. */
export async function publicProposal(db: Db, secret: string, now: Date): Promise<PublicProposal> {
  let proposal = await byToken(db, secret);
  if (proposal.status === 'sent' && proposal.valid_until < day(now)) {
    await db.query(`update proposals set status = 'expired' where id = $1`, [proposal.id]);
    proposal = { ...proposal, status: 'expired' };
  }
  const lead = await leadOf(db, proposal.lead_id);
  return {
    number: proposal.number,
    title: proposal.title,
    client: lead.company ?? lead.name,
    items: proposal.items,
    total_minor: Number(proposal.total_minor),
    currency: proposal.currency,
    deposit_minor: shareOf(Number(proposal.total_minor), proposal.deposit_bps),
    notes: proposal.notes,
    locale: proposal.locale,
    valid_until: proposal.valid_until,
    status: proposal.status,
  };
}

/** The client accepts: the deal is won, and the deposit invoice (or the whole amount) is raised and sent. */
export async function acceptProposal(
  db: Db,
  secret: string,
  name: string,
  now: Date,
): Promise<{ invoice_number: string }> {
  const signer = name.trim().slice(0, 120);
  if (!signer) throw invalid('type your name to accept');
  const current = await publicProposal(db, secret, now);
  if (current.status === 'accepted') {
    const proposal = await byToken(db, secret);
    const invoice = one(
      await db.query<{ number: string }>(
        'select number from invoices where proposal_id = $1 order by created_at limit 1',
        [proposal.id],
      ),
    );
    return { invoice_number: invoice.number };
  }
  if (current.status !== 'sent') throw new AppError('closed', `This proposal is ${current.status}.`, 409);
  return db.tx(async (tx) => {
    const proposal = await byToken(tx, secret);
    const lead = await leadOf(tx, proposal.lead_id);
    await tx.query(`update proposals set status = 'accepted', accepted_by = $2, decided_at = $3 where id = $1`, [
      proposal.id,
      signer,
      now,
    ]);
    const total = Number(proposal.total_minor);
    const deposit =
      proposal.deposit_bps > 0 && proposal.deposit_bps < 10_000 ? shareOf(total, proposal.deposit_bps) : total;
    const invoice = await insertInvoice(tx, {
      leadId: lead.id,
      proposalId: proposal.id,
      title: deposit === total ? proposal.title : `${proposal.title} (deposit)`,
      items: [
        { description: deposit === total ? proposal.title : `Deposit for ${proposal.number}`, amount_minor: deposit },
      ],
      currency: proposal.currency,
      buyerName: lead.company ?? lead.name,
      buyerEmail: lead.email,
      locale: lead.locale,
      dueDays: await getPolicy(tx, 'billing.due_days'),
      now,
    });
    await tx.query(`update leads set stage = 'won' where id = $1`, [lead.id]);
    await stopSequence(tx, lead.id);
    await enqueue(
      tx,
      'sales.send_document',
      { kind: 'invoice', id: invoice.id },
      { key: `send:invoice:${invoice.id}` },
    );
    await tx.query(
      `insert into security_alerts (severity, kind, summary, detail) values ('info', 'deal_won', $1, $2::jsonb)`,
      [`${lead.company ?? lead.name} accepted proposal ${proposal.number}.`, json({ proposal_id: proposal.id })],
    );
    await audit(tx, {
      actor: { kind: 'automation', id: 'proposal-page' },
      type: 'proposal.accepted',
      subject: { type: 'proposal', id: proposal.id },
      data: { signed_as: signer, invoice: invoice.number },
    });
    return { invoice_number: invoice.number };
  });
}

export async function declineProposal(db: Db, secret: string, reason: string, now: Date): Promise<void> {
  const proposal = await byToken(db, secret);
  if (proposal.status !== 'sent') throw new AppError('closed', `This proposal is ${proposal.status}.`, 409);
  await db.query(`update proposals set status = 'declined', decided_at = $2 where id = $1`, [proposal.id, now]);
  await stopSequence(db, proposal.lead_id);
  await db.query(
    `insert into security_alerts (severity, kind, summary, detail) values ('info', 'proposal_declined', $1, $2::jsonb)`,
    [`Proposal ${proposal.number} was declined.`, json({ proposal_id: proposal.id, reason: reason.slice(0, 1000) })],
  );
}

export async function listProposals(db: Db): Promise<ProposalRow[]> {
  return db.query<ProposalRow>('select * from proposals order by created_at desc limit 200');
}

// ---------------------------------------------------------------- Invoices

async function insertInvoice(
  db: Db,
  i: {
    leadId: string | null;
    proposalId: string | null;
    title: string;
    items: Item[];
    currency: string;
    buyerName: string;
    buyerEmail: string | null;
    locale: Locale;
    dueDays: number;
    now: Date;
  },
): Promise<InvoiceRow> {
  return one(
    await db.query<InvoiceRow>(
      `insert into invoices (number, lead_id, proposal_id, title, items, total_minor, currency, buyer_name, buyer_email,
         locale, due_on, public_token, created_at)
       values ('INV-' || to_char($12::timestamptz, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0'),
         $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [
        i.leadId,
        i.proposalId,
        i.title,
        json(i.items),
        i.items.reduce((sum, item) => sum + item.amount_minor, 0),
        i.currency,
        i.buyerName,
        i.buyerEmail,
        i.locale,
        day(i.now, i.dueDays),
        token(),
        i.now,
      ],
    ),
  );
}

const invoiceInput = z.strictObject({
  lead_id: z.uuid().optional(),
  proposal_id: z.uuid().optional(),
  title: z.string().trim().min(1).max(160),
  items,
  currency: currency.default('USD'),
  due_days: z.number().int().min(0).max(90).optional(),
  /** For a sale with no lead, such as a Gumroad or PayPal sale: who bought. */
  buyer_name: z.string().trim().max(120).optional(),
  buyer_email: z.email().optional(),
  /** Set for money already received elsewhere (gumroad, paypal, bank): the invoice is recorded as paid and not sent. */
  paid_via: z.enum(['bank', 'cliq', 'paypal', 'gumroad', 'cash', 'other']).optional(),
});

export async function createInvoice(db: Db, raw: unknown, by: Actor, now: Date): Promise<InvoiceRow> {
  const input = parse(invoiceInput, raw, 'invoice');
  const lead = input.lead_id ? await leadOf(db, input.lead_id) : null;
  if (!lead && !input.buyer_name) throw invalid('an invoice needs a lead or a buyer name');
  const { items: lines } = priced(input.items, input.currency);
  const invoice = await db.tx(async (tx) => {
    const created = await insertInvoice(tx, {
      leadId: lead?.id ?? null,
      proposalId: input.proposal_id ?? null,
      title: input.title,
      items: lines,
      currency: input.currency,
      buyerName: input.buyer_name || lead?.company || lead?.name || 'Client',
      buyerEmail: input.buyer_email ?? lead?.email ?? null,
      locale: lead?.locale ?? 'en',
      dueDays: input.due_days ?? (await getPolicy(tx, 'billing.due_days')),
      now,
    });
    await audit(tx, {
      actor: by,
      type: 'invoice.created',
      subject: { type: 'invoice', id: created.id },
      data: { number: created.number, total_minor: created.total_minor, paid_via: input.paid_via ?? null },
    });
    return created;
  });
  if (input.paid_via) return markInvoicePaid(db, invoice.id, input.paid_via, by, now, { thank: false });
  return invoice;
}

export async function sendInvoice(db: Db, invoiceId: string, by: Actor): Promise<void> {
  const invoice = await invoiceOf(db, invoiceId);
  if (!['draft', 'sent'].includes(invoice.status)) throw invalid(`the invoice is ${invoice.status}`);
  if (!invoice.buyer_email) throw invalid('the invoice has no email address to send it to');
  await enqueue(db, 'sales.send_document', { kind: 'invoice', id: invoice.id }, { key: `send:invoice:${invoice.id}` });
  await audit(db, { actor: by, type: 'invoice.send_asked', subject: { type: 'invoice', id: invoice.id } });
}

async function invoiceOf(db: Db, invoiceId: string): Promise<InvoiceRow> {
  const invoice = maybeOne(await db.query<InvoiceRow>('select * from invoices where id = $1', [invoiceId]));
  if (!invoice) throw notFound('invoice');
  return invoice;
}

/**
 * The owner confirms the money is in. It is posted to the services books, the lead is a paying client, the check-ins
 * start, and Sales thanks the client. Marking it twice changes nothing.
 */
export async function markInvoicePaid(
  db: Db,
  invoiceId: string,
  via: string,
  by: Actor,
  now: Date,
  options: { thank?: boolean } = {},
): Promise<InvoiceRow> {
  return db.tx(async (tx) => {
    const invoice = await invoiceOf(tx, invoiceId);
    if (invoice.status === 'paid') return invoice;
    if (invoice.status === 'void') throw invalid('a void invoice cannot be paid');
    const [paid] = await tx.query<InvoiceRow>(
      `update invoices set status = 'paid', paid_at = $2, paid_via = $3 where id = $1 returning *`,
      [invoice.id, now, via.slice(0, 40)],
    );
    const amount = Number(invoice.total_minor);
    const ref = { refType: 'invoice', refId: invoice.id, engine: 'services' as const, currency: invoice.currency };
    await post(
      tx,
      [
        { ...ref, account: 'gross_revenue', amountMinor: amount, memo: `Invoice ${invoice.number}` },
        { ...ref, account: 'settled_revenue', amountMinor: amount, memo: `Paid by ${via}` },
      ],
      now,
    );
    if (invoice.lead_id) {
      await tx.query(`update leads set stage = 'paid' where id = $1 and stage <> 'retained'`, [invoice.lead_id]);
      await startSequence(tx, invoice.lead_id, 'check_in', now);
    }
    if (options.thank !== false && invoice.buyer_email)
      await enqueue(
        tx,
        'sales.send_document',
        { kind: 'receipt', id: invoice.id },
        { key: `send:receipt:${invoice.id}` },
      );
    await audit(tx, {
      actor: by,
      type: 'invoice.paid',
      subject: { type: 'invoice', id: invoice.id },
      data: { number: invoice.number, amount_minor: amount, currency: invoice.currency, via },
    });
    return paid!;
  });
}

export async function voidInvoice(db: Db, invoiceId: string, by: Actor): Promise<InvoiceRow> {
  const invoice = await invoiceOf(db, invoiceId);
  if (invoice.status === 'paid') throw invalid('a paid invoice is corrected with a refund, not voided');
  const [updated] = await db.query<InvoiceRow>(`update invoices set status = 'void' where id = $1 returning *`, [
    invoice.id,
  ]);
  await audit(db, { actor: by, type: 'invoice.voided', subject: { type: 'invoice', id: invoice.id } });
  return updated!;
}

export async function listInvoices(db: Db): Promise<InvoiceRow[]> {
  return db.query<InvoiceRow>('select * from invoices order by created_at desc limit 200');
}

export interface PublicInvoice {
  number: string;
  title: string;
  buyer: string;
  items: Item[];
  total_minor: number;
  currency: string;
  locale: Locale;
  due_on: string;
  status: 'sent' | 'paid' | 'void';
  how_to_pay: string;
}

export async function publicInvoice(db: Db, secret: string): Promise<PublicInvoice> {
  const invoice = maybeOne(
    await db.query<InvoiceRow>(`select * from invoices where public_token = $1 and status <> 'draft'`, [secret]),
  );
  if (!invoice) throw notFound('invoice');
  return {
    number: invoice.number,
    title: invoice.title,
    buyer: invoice.buyer_name,
    items: invoice.items,
    total_minor: Number(invoice.total_minor),
    currency: invoice.currency,
    locale: invoice.locale,
    due_on: invoice.due_on,
    status: invoice.status as PublicInvoice['status'],
    how_to_pay: await getPolicy(db, 'billing.payment_instructions'),
  };
}

/** Called once the invoice email is proposed. */
export async function markInvoiceSent(db: Db, invoiceId: string, now: Date): Promise<void> {
  await db.query(
    `update invoices set status = 'sent', sent_at = coalesce(sent_at, $2) where id = $1 and status = 'draft'`,
    [invoiceId, now],
  );
}

/** Sent invoices past their due date that may get a reminder: at most two, a week apart. */
export async function invoicesToRemind(db: Db, now: Date): Promise<InvoiceRow[]> {
  return db.query<InvoiceRow>(
    `select * from invoices where status = 'sent' and buyer_email is not null and reminders_sent < 2
       and due_on + (reminders_sent * 7) <= $1::date order by due_on limit 20`,
    [day(now)],
  );
}
