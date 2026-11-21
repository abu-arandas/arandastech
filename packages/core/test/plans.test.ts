import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi, type ApiResponse } from '../src/api/index';
import { DEMO_OWNER_ID } from '../src/company';
import { firstInvoiceDayFrom, nextInvoiceDay } from '../src/crm/plan-dates';
import { setPolicy } from '../src/governance/settings';
import { createTestPlatform, OWNER, type TestPlatform } from './helpers/platform';

/**
 * Plans (work package 4): a shop that asks for the free trial on the website gets the trial answer; marked "Won", its
 * plan starts free and raises its invoice when the trial ends. A monthly plan raises one invoice a month, goes on hold
 * with one polite note when an invoice is 14 days late, raises nothing while on hold, and comes back once it is paid.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const TOKEN = 'owner-test-token';
const DAY = 24;

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

describe('the days a plan bills on', () => {
  it('keeps the same day each month, or the last day of a shorter month', () => {
    expect(nextInvoiceDay('2026-01-31', 'month', 31)).toBe('2026-02-28');
    expect(nextInvoiceDay('2026-02-28', 'month', 31)).toBe('2026-03-31');
    expect(nextInvoiceDay('2026-12-15', 'month', 15)).toBe('2027-01-15');
    expect(nextInvoiceDay('2028-02-29', 'year', 29)).toBe('2029-02-28');
  });

  it('after a hold, picks the first usual day from today, so the months on hold are not billed', () => {
    expect(firstInvoiceDayFrom('2026-11-15', 'month', 15, '2027-01-20')).toBe('2027-02-15');
    expect(firstInvoiceDayFrom('2026-11-15', 'month', 15, '2026-11-15')).toBe('2026-11-15');
  });
});

describe('plans', () => {
  let t: TestPlatform;
  let api: ReturnType<typeof apiFor>;
  // The morning run, then the jobs it queued (the invoice emails).
  const sequences = async () => {
    await t.platform.agents.runWorkflow('sales.sequences', {}, { trigger: 'schedule' });
    await t.platform.agents.runDue();
  };
  const planOf = async (email: string): Promise<Json> =>
    (await api.owner('GET', '/api/owner/pipeline')).body.plans.find((p: Json) => p.buyer_email === email);
  const invoicesOf = (planId: string) =>
    t.test.db.query<Json>(`select * from invoices where plan_id = $1 order by created_at`, [planId]);
  const emails = (template: string) =>
    t.test.db.query<Json>(
      `select * from actions where action_type = 'gmail.send_email' and payload ->> 'template' = $1`,
      [template],
    );

  beforeAll(async () => {
    t = await createTestPlatform();
    api = apiFor(t);
    await setPolicy(t.test.db, 'sales.booking_link', 'https://calendar.app.google/zirr-test', OWNER);
  });
  afterAll(async () => t.test.drop());

  it('a shop asks for the trial on the website and gets the trial answer with the setup call link', async () => {
    const sent = await api.visitor('POST', '/api/public/leads', {
      name: 'Huda Saleh',
      email: 'huda@huda-cafe.example',
      company: 'Huda Café',
      phone: '+962790000000',
      locale: 'en',
      message: 'Free trial request. Business: café. City: Amman.',
      source: 'trial',
      projectType: 'shop-trial',
    });
    expect(sent.status).toBe(200);
    await t.platform.agents.runDue();
    const [answer] = await emails('trial-welcome');
    expect(answer!.payload).toMatchObject({ to: 'huda@huda-cafe.example', template: 'trial-welcome' });
    expect(answer!.payload.subject).toContain('14-day');
    expect(answer!.payload.body).toContain('Hello Huda,');
    expect(answer!.payload.body).toContain('Huda Café');
    expect(answer!.payload.body).toContain('https://calendar.app.google/zirr-test');
    // Words typed by an outsider: the answer waits for the owner.
    expect(answer!.status).toBe('pending');
  });

  it('marked "Won", the trial plan starts free, and its one invoice comes when the trial ends', async () => {
    const [lead] = await t.test.db.query<Json>(`select id from leads where email = 'huda@huda-cafe.example'`);
    const won = await api.owner('POST', `/api/owner/leads/${lead!.id}`, { stage: 'won' });
    expect(won.body.plan).toMatchObject({
      status: 'trial',
      every: 'once',
      amount_minor: 299_000,
      currency: 'JOD',
      next_invoice_on: '2026-11-29',
      buyer_name: 'Huda Café',
    });
    // Marking it won again does not start a second plan.
    expect((await api.owner('POST', `/api/owner/leads/${lead!.id}`, { stage: 'won' })).body.plan).toBeNull();

    await sequences();
    expect(await invoicesOf(won.body.plan.id)).toHaveLength(0);
    t.clock.advance(14 * DAY);
    await sequences();
    await sequences();
    const [invoice, ...more] = await invoicesOf(won.body.plan.id);
    expect(more).toHaveLength(0);
    expect(invoice).toMatchObject({ title: 'Zirr shop plan', total_minor: 299_000, currency: 'JOD' });
    await t.platform.agents.runDue();
    const sent = (await emails('invoice')).find((a) => a.payload.to === 'huda@huda-cafe.example');
    expect(sent!.payload.body).toContain('299.000 JOD');
    expect(await planOf('huda@huda-cafe.example')).toMatchObject({ status: 'active', next_invoice_on: null });

    await api.owner('POST', `/api/owner/invoices/${invoice!.id}/paid`, { via: 'cliq' });
    expect(await planOf('huda@huda-cafe.example')).toMatchObject({ status: 'ended' });
  });

  let monthly: Json;
  it('a monthly plan raises one invoice on its day, never two', async () => {
    await api.owner('POST', '/api/owner/prospects', {
      prospects: [{ name: 'Sami', email: 'sami@sami-shop.example', company: 'Sami Shop', audience: 'shop' }],
    });
    const [lead] = await t.test.db.query<Json>(`select id from leads where email = 'sami@sami-shop.example'`);
    const made = await api.owner('POST', '/api/owner/plans', {
      lead_id: lead!.id,
      amount: '10',
      currency: 'JOD',
      every: 'month',
    });
    expect(made.status).toBe(200);
    monthly = made.body.plan;
    expect(monthly).toMatchObject({ status: 'active', next_invoice_on: '2026-11-29', anchor_day: 29 });
    const again = await api.owner('POST', '/api/owner/plans', {
      lead_id: lead!.id,
      amount: '10',
      every: 'month',
    });
    expect(again.status).toBe(422);

    await sequences();
    await sequences();
    const invoices = await invoicesOf(monthly.id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.items[0].description).toBe('Zirr shop plan, month from 2026-11-29');
    expect(await planOf('sami@sami-shop.example')).toMatchObject({ next_invoice_on: '2026-12-29', invoices_made: 1 });
  });

  it('14 days late, the plan goes on hold with one polite note, and raises nothing while on hold', async () => {
    // Due on 6 December (7 days); reminders on the due day and a week later; on hold on the 20th.
    t.clock.advance(20 * DAY);
    await sequences();
    expect(await planOf('sami@sami-shop.example')).toMatchObject({ status: 'active' });
    t.clock.advance(DAY);
    await sequences();
    await sequences();
    expect(await planOf('sami@sami-shop.example')).toMatchObject({ status: 'on_hold' });
    const notes = await emails('plan-on-hold');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.payload.body).toContain('10.000 JOD');
    const [alert] = await t.test.db.query<Json>(`select summary from security_alerts where kind = 'plan_on_hold'`);
    expect(alert!.summary).toContain('Sami Shop');

    // 29 December passes with no new invoice.
    t.clock.advance(10 * DAY);
    await sequences();
    expect(await invoicesOf(monthly.id)).toHaveLength(1);
  });

  it('paying the late invoice brings the plan back on its usual day, with no invoices for the months on hold', async () => {
    t.clock.advance(25 * DAY); // 2027-01-24
    const [late] = await invoicesOf(monthly.id);
    await api.owner('POST', `/api/owner/invoices/${late!.id}/paid`, { via: 'bank' });
    expect(await planOf('sami@sami-shop.example')).toMatchObject({ status: 'active', next_invoice_on: '2027-01-29' });
    await sequences();
    expect(await invoicesOf(monthly.id)).toHaveLength(1);
    t.clock.advance(5 * DAY);
    await sequences();
    expect(await invoicesOf(monthly.id)).toHaveLength(2);
  });

  it('a cancelled plan raises nothing more, and a held plan can be resumed by the owner', async () => {
    const cancelled = await api.owner('POST', `/api/owner/plans/${monthly.id}/cancel`, {});
    expect(cancelled.body.plan).toMatchObject({ status: 'cancelled', next_invoice_on: null });
    t.clock.advance(40 * DAY);
    await sequences();
    expect(await invoicesOf(monthly.id)).toHaveLength(2);
    expect((await api.owner('POST', `/api/owner/plans/${monthly.id}/resume`, {})).status).toBe(422);
  });

  it('the plan after the trial is set on the policy sheet: once, month or year', async () => {
    await setPolicy(t.test.db, 'billing.trial_plan_every', 'month', OWNER);
    await expect(setPolicy(t.test.db, 'billing.trial_plan_every', 'weekly', OWNER)).rejects.toThrow(
      'one of: once, month, year',
    );
  });
});
