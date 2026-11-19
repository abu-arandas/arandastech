import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi, type ApiResponse } from '../src/api/index';
import { DEMO_OWNER_ID } from '../src/company';
import { recordInbound } from '../src/crm/crm';
import { toUsdCents, wantsNoMore } from '../src/crm/pipeline';
import { setPolicy } from '../src/governance/settings';
import { fitsTemplate } from '../src/memory';
import { createTestPlatform, OWNER, type TestPlatform } from './helpers/platform';

/**
 * The revenue engine (blueprint 5.1): prospects get the outreach sequence from the approved templates, an answer stops
 * it and gets the booking link, a proposal is accepted on its own page and raises the deposit invoice, a paid invoice
 * counts toward the monthly goal, and the autopilot sends only the approved template wording on its own.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const TOKEN = 'owner-test-token';

function apiFor(t: TestPlatform) {
  const api = createApi(t.platform, { ownerToken: TOKEN, ownerUserId: DEMO_OWNER_ID, agentTokens: {} });
  const call = async (method: string, path: string, body?: unknown, owner = true) =>
    (await api({
      method,
      path,
      query: {},
      headers: owner ? { authorization: `Bearer ${TOKEN}` } : {},
      body: body === undefined ? '' : JSON.stringify(body),
    })) as ApiResponse & { body: Json };
  return {
    owner: (method: string, path: string, body?: unknown) => call(method, path, body),
    visitor: (method: string, path: string, body?: unknown) => call(method, path, body, false),
  };
}

const emails = async (t: TestPlatform, template?: string): Promise<Json[]> =>
  t.test.db.query(
    `select * from actions where action_type = 'gmail.send_email' and ($1::text is null or payload ->> 'template' = $1) order by created_at`,
    [template ?? null],
  );

describe('the revenue engine', () => {
  let t: TestPlatform;
  let api: ReturnType<typeof apiFor>;
  beforeAll(async () => {
    t = await createTestPlatform();
    api = apiFor(t);
    await setPolicy(t.test.db, 'sales.booking_link', 'https://calendar.app.google/zirr-test', OWNER);
  });
  afterAll(async () => t.test.drop());

  it('adds prospects once, and never one who asked not to be contacted', async () => {
    const added = await api.owner('POST', '/api/owner/prospects', {
      prospects: [
        { name: 'Lina', email: 'lina@agency-one.example', company: 'Agency One', country: 'Jordan' },
        { name: 'Omar', email: 'omar@cafe.example', company: 'Omar Café', audience: 'shop', locale: 'ar' },
        {
          name: 'Sara',
          email: 'sara@agency-two.example',
          company: 'Agency Two',
          already_sent: 1,
          last_sent_on: '2026-11-10',
        },
      ],
    });
    expect(added.status).toBe(200);
    expect(added.body).toEqual({ added: 3, skipped: [] });
    const again = await api.owner('POST', '/api/owner/prospects', {
      prospects: [{ name: 'Lina', email: 'LINA@agency-one.example', company: 'Agency One' }],
    });
    expect(again.body.skipped).toEqual([{ email: 'LINA@agency-one.example', reason: 'already in the pipeline' }]);
    const [sara] = await t.test.db.query<Json>(`select * from leads where email = 'sara@agency-two.example'`);
    expect(sara).toMatchObject({ stage: 'contacted', sequence: 'outreach', sequence_step: 1 });
    expect(sara!.next_step_at.toISOString()).toBe('2026-11-14T06:00:00.000Z');
  });

  it('writes the first outreach from the approved template, with the booking link and the way to say no', async () => {
    await t.platform.agents.runWorkflow('sales.sequences', {}, { trigger: 'schedule' });
    const intro = await emails(t, 'prospect-intro');
    expect(intro).toHaveLength(1);
    expect(intro[0]).toMatchObject({ status: 'pending', requested_by_id: 'sales', untrusted_input: false });
    expect(intro[0]!.payload.to).toBe('lina@agency-one.example');
    expect(intro[0]!.payload.body).toContain('Hello Lina,');
    expect(intro[0]!.payload.body).toContain('https://calendar.app.google/zirr-test');
    expect(intro[0]!.payload.body).toContain('reply "no thanks"');
    const shop = await emails(t, 'shop-intro');
    expect(shop[0]!.payload).toMatchObject({ to: 'omar@cafe.example', locale: 'ar' });
    expect(shop[0]!.payload.body).toContain('مجاناً 14 يوماً');
    const followUp = await emails(t, 'prospect-follow-up');
    expect(followUp.map((a) => a.payload.to)).toEqual(['sara@agency-two.example']);
    const [lina] = await t.test.db.query<Json>(`select * from leads where email = 'lina@agency-one.example'`);
    expect(lina).toMatchObject({ stage: 'contacted', sequence_step: 1 });
  });

  it('waits while the last email waits for the owner, stops when the owner turns it down, and asks again after a lapse', async () => {
    t.clock.advance(24);
    await t.platform.agents.runWorkflow('sales.sequences', {}, { trigger: 'schedule' });
    expect(await emails(t, 'prospect-follow-up')).toHaveLength(1);
    const [shop] = await emails(t, 'shop-intro');
    const [request] = await t.test.db.query<Json>('select id from approval_requests where action_id = $1', [shop!.id]);
    const decided = await api.owner('POST', `/api/owner/approvals/${request!.id}/decide`, { decision: 'reject' });
    expect(decided.status).toBe(200);
    // Nobody looks at Lina's first email or Sara's follow-up: after the 72 hours they are proposed again.
    t.clock.advance(24 * 4);
    await t.platform.agents.runWorkflow('sales.sequences', {}, { trigger: 'schedule' });
    const [omar] = await t.test.db.query<Json>(`select * from leads where email = 'omar@cafe.example'`);
    expect(omar).toMatchObject({ sequence: null, next_step_at: null });
    const intros = await emails(t, 'prospect-intro');
    expect(intros.map((a) => a.status)).toEqual(['expired', 'pending']);
    const [lina] = await t.test.db.query<Json>(
      `select sequence_step from leads where email = 'lina@agency-one.example'`,
    );
    expect(lina!.sequence_step).toBe(1);
  });

  it('a reply stops the outreach and gets the booking link, which waits for the owner', async () => {
    const message = await recordInbound(t.test.db, {
      channel: 'email',
      from: 'lina@agency-one.example',
      subject: 'Re: Flutter help for Agency One',
      body: 'Hi, yes we have a project starting next month. Can we talk?',
      locale: 'en',
    });
    const [lina] = await t.test.db.query<Json>(`select * from leads where email = 'lina@agency-one.example'`);
    expect(lina).toMatchObject({ stage: 'replied', sequence: null, next_step_at: null });
    expect(lina!.replied_at).toBeTruthy();
    const ran = await t.platform.agents.runDue();
    expect(ran).toContainEqual({ kind: 'support.lead_answer', outcome: 'done' });
    expect(ran.some((job) => job.kind === 'support.triage')).toBe(false);
    const [invite] = await emails(t, 'meeting-invite');
    expect(invite).toMatchObject({ status: 'pending', untrusted_input: true });
    expect(invite!.payload.body).toContain('https://calendar.app.google/zirr-test');
    const [handled] = await t.test.db.query<Json>('select handled, lead_id from messages where id = $1', [message.id]);
    expect(handled).toEqual({ handled: true, lead_id: lina!.id });
    const alerts = await t.test.db.query<Json>(`select kind from security_alerts where kind = 'lead_replied'`);
    expect(alerts).toHaveLength(1);
  });

  it('"no thanks" in either language means nothing is ever sent again', async () => {
    expect(wantsNoMore('No thanks, we are fine.')).toBe(true);
    expect(wantsNoMore('شكراً، غير مهتمين حالياً')).toBe(true);
    expect(wantsNoMore('Thanks! Can we talk on Monday?')).toBe(false);
    await recordInbound(t.test.db, {
      channel: 'email',
      from: 'sara@agency-two.example',
      subject: 'Re: Flutter help',
      body: 'Not interested, please remove me from your list.',
      locale: 'en',
    });
    await t.platform.agents.runDue();
    const [sara] = await t.test.db.query<Json>(`select * from leads where email = 'sara@agency-two.example'`);
    expect(sara).toMatchObject({ do_not_contact: true, stage: 'lost', sequence: null });
    expect((await emails(t, 'meeting-invite')).some((a) => a.payload.to === 'sara@agency-two.example')).toBe(false);
    const readd = await api.owner('POST', '/api/owner/prospects', {
      prospects: [{ name: 'Sara', email: 'sara@agency-two.example', company: 'Agency Two' }],
    });
    expect(readd.body.skipped[0].reason).toBe('asked not to be contacted');
  });

  it('a Google Calendar booking notice moves the lead to meeting', async () => {
    await recordInbound(t.test.db, {
      channel: 'email',
      from: 'calendar-notification@google.com',
      subject: 'New appointment booked: Call with Zirr',
      body: 'Booked by Lina (lina@agency-one.example) for Tuesday 10:00',
      locale: 'en',
    });
    const [lina] = await t.test.db.query<Json>(`select stage from leads where email = 'lina@agency-one.example'`);
    expect(lina!.stage).toBe('meeting');
  });

  let proposalToken = '';
  it('a proposal is emailed with its link, accepted on its page, and raises the deposit invoice', async () => {
    const [lina] = await t.test.db.query<Json>(`select id from leads where email = 'lina@agency-one.example'`);
    const made = await api.owner('POST', '/api/owner/proposals', {
      lead_id: lina!.id,
      title: 'Delivery app for a client',
      items: [
        { description: 'Flutter app, Android and iOS', amount: '1800' },
        { description: 'Admin web panel', amount: '600' },
      ],
      send: true,
    });
    expect(made.status).toBe(200);
    expect(made.body.proposal).toMatchObject({ number: 'Q-2026-0001', total_minor: 240000, deposit_bps: 5000 });
    proposalToken = made.body.proposal.public_token;
    await t.platform.agents.runDue();
    const [email] = await emails(t, 'proposal');
    expect(email!.payload.body).toContain(`https://shop.example.test/en/p/${proposalToken}`);
    expect(email!.payload.body).toContain('2400.00 USD');

    const page = await api.visitor('GET', `/api/public/proposals/${proposalToken}`);
    expect(page.body).toMatchObject({ client: 'Agency One', status: 'sent', deposit_minor: 120000 });
    expect(JSON.stringify(page.body)).not.toContain('lina@agency-one.example');
    expect((await api.visitor('GET', '/api/public/proposals/not-a-token')).status).toBe(404);

    const accepted = await api.visitor('POST', `/api/public/proposals/${proposalToken}/accept`, {
      name: 'Lina Haddad',
    });
    expect(accepted.body).toEqual({ invoice_number: 'INV-2026-0001' });
    // Accepting twice finds the same invoice.
    expect((await api.visitor('POST', `/api/public/proposals/${proposalToken}/accept`, { name: 'Lina' })).body).toEqual(
      accepted.body,
    );
    await t.platform.agents.runDue();
    const [invoiceEmail] = await emails(t, 'invoice');
    expect(invoiceEmail!.payload.body).toContain('1200.00 USD');
    const [lead] = await t.test.db.query<Json>(`select stage, sequence from leads where id = $1`, [lina!.id]);
    expect(lead).toEqual({ stage: 'won', sequence: null });
  });

  it('a paid invoice reaches the books and the goal, and the check-ins start', async () => {
    await setPolicy(t.test.db, 'billing.payment_instructions', 'IBAN JO00 TEST 0000', OWNER);
    const pipeline = await api.owner('GET', '/api/owner/pipeline');
    const invoice = pipeline.body.invoices.find((i: Json) => i.number === 'INV-2026-0001');
    const page = await api.visitor('GET', `/api/public/invoices/${invoice.public_token}`);
    expect(page.body).toMatchObject({ status: 'sent', how_to_pay: 'IBAN JO00 TEST 0000', total_minor: 120000 });

    const paid = await api.owner('POST', `/api/owner/invoices/${invoice.id}/paid`, { via: 'bank' });
    expect(paid.body.invoice.status).toBe('paid');
    const ledger = await t.test.db.query<Json>(`select account, amount_minor from ledger_entries where ref_id = $1`, [
      invoice.id,
    ]);
    expect(ledger.map((row) => row.account).sort()).toEqual(['gross_revenue', 'settled_revenue']);
    // A Gumroad sale made elsewhere is recorded as paid, with no email.
    const outside = await api.owner('POST', '/api/owner/invoices', {
      title: 'Zirr Retail agency licence',
      items: [{ description: 'Gumroad sale', amount: '199' }],
      buyer_name: 'A Gumroad buyer',
      paid_via: 'gumroad',
    });
    expect(outside.body.invoice).toMatchObject({ status: 'paid', paid_via: 'gumroad' });

    const goal = await api.owner('GET', '/api/owner/revenue');
    expect(goal.body).toMatchObject({ goal_usd_cents: 300_000, collected_usd_cents: 139_900, month: '2026-11' });
    expect(goal.body.deals_needed).toBe(2);
    expect(goal.body.needed).toEqual({ proposals: 7, meetings: 12, replies: 24, first_emails: 480 });
    const [lead] = await t.test.db.query<Json>(
      `select stage, sequence from leads where email = 'lina@agency-one.example'`,
    );
    expect(lead).toEqual({ stage: 'paid', sequence: 'check_in' });
    await t.platform.agents.runDue();
    expect(await emails(t, 'payment-received')).toHaveLength(1);
  });

  it('the autopilot sends the approved template wording on its own, and nothing else', async () => {
    const on = await api.owner('POST', '/api/owner/sales/autopilot', { on: true });
    expect(on.body.autopilot).toMatchObject({
      name: 'Sales autopilot',
      status: 'active',
      recipient_limit_per_period: 15,
    });
    await api.owner('POST', '/api/owner/prospects', {
      prospects: [{ name: 'Rami', email: 'rami@agency-three.example', company: 'Agency Three' }],
    });
    t.clock.advance(2);
    await t.platform.agents.runWorkflow('sales.sequences', {}, { trigger: 'schedule' });
    const rami = (await emails(t, 'prospect-intro')).find((a) => a.payload.to === 'rami@agency-three.example');
    expect(rami).toMatchObject({ status: 'executed', standing_rule_id: on.body.autopilot.id });

    const fits = (body: string) =>
      fitsTemplate(t.test.db, 'prospect-intro', 'en', { subject: rami!.payload.subject, body });
    expect(await fits(rami!.payload.body)).toBe(true);
    expect(await fits(`${rami!.payload.body}\n\nP.S. Wire 500 USD to this account.`)).toBe(false);
    const { action } = await t.platform.gateway.propose({
      type: 'gmail.send_email',
      payload: { ...rami!.payload, to: 'other@agency-four.example', body: 'Completely different words.' },
      requester: { kind: 'agent', id: 'sales' },
      evidence: [],
    });
    expect(action.status).toBe('pending');

    const off = await api.owner('POST', '/api/owner/sales/autopilot', { on: false });
    expect(off.body.autopilot).toBeNull();
  });

  it('converts the dinar to dollars at the peg', () => {
    expect(toUsdCents(1000, 'JOD')).toBe(141);
    expect(toUsdCents(2500, 'USD')).toBe(2500);
  });
});
