import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMockConnectors, listMockDeliveries, type MockConnector } from '../src/connectors/mock';
import { expireDueApprovals, listOpenApprovals } from '../src/governance/approvals';
import { verifyAuditChain } from '../src/governance/audit';
import { Gateway } from '../src/governance/gateway';
import { pause, resume } from '../src/governance/pause';
import { createRule } from '../src/governance/rules';
import { setPolicy } from '../src/governance/settings';
import type { Db } from '../src/lib/db';
import { AppError } from '../src/lib/errors';
import type { Actor } from '../src/lib/types';
import { seedBase } from '../src/seed';
import { createTestDb, testClock, type TestDb } from './helpers/db';

const OWNER: Actor = { kind: 'person', id: '00000000-0000-4000-8000-000000000001' };
const SALES: Actor = { kind: 'agent', id: 'sales' };
const SUPPORT: Actor = { kind: 'agent', id: 'support' };
const owner = { by: OWNER, isOwner: true };

const email = (overrides: Record<string, unknown> = {}) => ({
  to: 'lead@example.com',
  subject: 'Your enquiry',
  body: 'Thank you for writing to Zirr.',
  locale: 'en',
  ...overrides,
});

let test: TestDb;
let db: Db;
let mocks: Record<string, MockConnector>;
let gateway: Gateway;
let clock: ReturnType<typeof testClock>;

beforeAll(async () => {
  test = await createTestDb();
  db = test.db;
  await seedBase(db);
});
afterAll(async () => test.drop());

beforeEach(() => {
  clock = testClock();
  mocks = createMockConnectors();
  gateway = new Gateway(db, mocks, clock.now);
});

const rejects = async (work: Promise<unknown>, code: string): Promise<AppError> => {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected an error with code ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
};

describe('action levels', () => {
  it('runs a Level 1 action at once and records it', async () => {
    const { action, request } = await gateway.propose({ type: 'gmail.create_draft', payload: email({ subject: 'Draft one' }), requester: SALES });
    expect(action.status).toBe('executed');
    expect(action.level).toBe(1);
    expect(request).toBeNull();
    expect(action.result).toHaveProperty('draft_id');
  });

  it('holds a Level 2 action for the owner and never sends it on its own', async () => {
    const before = (await listMockDeliveries(db, 'gmail')).length;
    const { action, request } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Level two' }), requester: SALES });
    expect(action.status).toBe('pending');
    expect(request?.status).toBe('pending');
    expect((await listMockDeliveries(db, 'gmail')).length).toBe(before);
  });

  it('sets the level from the action, not from the requester: a public issue is Level 2', async () => {
    const priv = await gateway.propose({ type: 'github.create_issue', payload: { repository: 'abu-arandas/zirr-retail', title: 'Checkout', body: '', public: false }, requester: { kind: 'agent', id: 'engineering' } });
    const pub = await gateway.propose({ type: 'github.create_issue', payload: { repository: 'abu-arandas/arandastech', title: 'Checkout', body: '', public: true }, requester: { kind: 'agent', id: 'engineering' } });
    expect(priv.action.level).toBe(1);
    expect(priv.action.status).toBe('executed');
    expect(pub.action.level).toBe(2);
    expect(pub.action.status).toBe('pending');
  });

  it('blocks an unknown action and a payload that does not fit', async () => {
    const unknown = await gateway.propose({ type: 'bank.wire_everything', payload: {}, requester: SALES });
    expect(unknown.action.status).toBe('blocked');
    expect(unknown.action.reasons).toContain('unknown_action');
    const bad = await gateway.propose({ type: 'gmail.send_email', payload: { to: 'not-an-address', subject: '', body: 'x', locale: 'en' }, requester: SALES });
    expect(bad.action.status).toBe('blocked');
    expect(String(bad.action.reasons[0])).toMatch(/^invalid_payload/);
    const smuggled = await gateway.propose({ type: 'gmail.send_email', payload: email({ bcc: 'attacker@example.com' }), requester: SALES });
    expect(smuggled.action.status).toBe('blocked');
  });
});

describe('approvals', () => {
  it('lets only the owner decide', async () => {
    const { request } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Owner only' }), requester: SALES });
    await rejects(gateway.decide(request!.id, { decision: 'approve', by: SALES, isOwner: false }), 'forbidden');
    await rejects(gateway.decide(request!.id, { decision: 'approve', by: { kind: 'person', id: 'member' }, isOwner: false }), 'forbidden');
  });

  it('sends exactly what was approved', async () => {
    const payload = email({ subject: 'Exact text', body: 'These exact words.' });
    const { request } = await gateway.propose({ type: 'gmail.send_email', payload, requester: SALES });
    const { action } = await gateway.decide(request!.id, { decision: 'approve', ...owner });
    expect(action.status).toBe('executed');
    const sent = (await listMockDeliveries(db, 'gmail')).find((d) => d.payload.subject === 'Exact text');
    expect(sent?.payload).toEqual(payload);
  });

  it("runs the owner's edited version and keeps both", async () => {
    const { request, action } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'To edit', body: 'Agent wording.' }), requester: SALES });
    const edited = email({ subject: 'To edit', body: 'Owner wording.' });
    const result = await gateway.decide(request!.id, { decision: 'approve', ...owner, editedPayload: edited });
    expect(result.action.payload).toEqual(edited);
    expect(result.action.payload_hash).not.toBe(action.payload_hash);
    const [decision] = await db.query<{ original_payload: { body: string }; edited_payload: { body: string } }>('select original_payload, edited_payload from approval_decisions where request_id = $1', [request!.id]);
    expect(decision?.original_payload.body).toBe('Agent wording.');
    expect(decision?.edited_payload.body).toBe('Owner wording.');
  });

  it('voids the request when the payload changes after it was raised', async () => {
    const { request, action } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Tampered' }), requester: SALES });
    await db.query(`update actions set payload = payload || '{"to": "attacker@example.com"}'::jsonb where id = $1`, [action.id]);
    await rejects(gateway.decide(request!.id, { decision: 'approve', ...owner }), 'conflict');
    const [after] = await db.query<{ status: string }>('select status from actions where id = $1', [action.id]);
    expect(after?.status).toBe('rejected');
    expect((await listMockDeliveries(db, 'gmail')).some((d) => d.payload.to === 'attacker@example.com')).toBe(false);
  });

  it('freezes the payload in the database once it is approved', async () => {
    const { request, action } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Frozen' }), requester: SALES });
    await pause(db, { scope: 'connector', target: 'gmail' }, 'test', OWNER);
    await gateway.decide(request!.id, { decision: 'approve', ...owner });
    await expect(db.query(`update actions set payload = '{"x": 1}'::jsonb where id = $1`, [action.id])).rejects.toThrow(/frozen/);
    await resume(db, { scope: 'connector', target: 'gmail' }, OWNER, true);
    await gateway.releaseHeld();
  });

  it('treats silence as a no', async () => {
    const { request, action } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Will expire' }), requester: SALES });
    clock.advance(73);
    await rejects(gateway.decide(request!.id, { decision: 'approve', ...owner }), 'conflict');
    const [after] = await db.query<{ status: string }>('select status from actions where id = $1', [action.id]);
    expect(after?.status).toBe('expired');

    const second = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Will expire too' }), requester: SALES });
    expect(await expireDueApprovals(db, new Date(clock.now().getTime() + 73 * 3_600_000))).toBeGreaterThanOrEqual(1);
    const [lapsed] = await db.query<{ status: string }>('select status from approval_requests where id = $1', [second.request!.id]);
    expect(lapsed?.status).toBe('expired');
  });

  it('records a rejection and a postponement without sending anything', async () => {
    const a = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Reject me' }), requester: SALES });
    const rejected = await gateway.decide(a.request!.id, { decision: 'reject', ...owner, note: 'Not now.' });
    expect(rejected.action.status).toBe('rejected');

    const b = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Later' }), requester: SALES });
    const postponed = await gateway.decide(b.request!.id, { decision: 'postpone', ...owner, postponeHours: 4 });
    expect(postponed.action.status).toBe('pending');
    expect((await listOpenApprovals(db, clock.now())).some((r) => r.id === b.request!.id)).toBe(false);
    clock.advance(5);
    expect((await listOpenApprovals(db, clock.now())).some((r) => r.id === b.request!.id)).toBe(true);
    expect((await listMockDeliveries(db, 'gmail')).some((d) => d.payload.subject === 'Reject me' || d.payload.subject === 'Later')).toBe(false);
  });

  it('lists the riskiest requests first', async () => {
    const open = await listOpenApprovals(db, clock.now());
    const levels = open.map((r) => r.level);
    expect(levels).toEqual([...levels].sort((x, y) => y - x));
  });
});

describe('Level 3', () => {
  const refund = (overrides: Record<string, unknown> = {}) => ({
    amount_minor: 5900,
    currency: 'USD',
    refund_id: '11111111-1111-4111-8111-111111111111',
    order_id: '22222222-2222-4222-8222-222222222222',
    payment_ref: 'pay_test',
    to: 'buyer@example.com',
    reason: 'Requested inside the refund policy.',
    ...overrides,
  });

  it('needs the amount and the recipient confirmed, and they must match', async () => {
    const { request, action } = await gateway.propose({ type: 'payments.refund', payload: refund(), requester: { kind: 'agent', id: 'finance' } });
    expect(action.level).toBe(3);
    expect(action.cost_minor).toBe(5900);
    await rejects(gateway.decide(request!.id, { decision: 'approve', ...owner }), 'invalid');
    await rejects(gateway.decide(request!.id, { decision: 'approve', ...owner, confirmation: { amount_minor: 590, recipient: 'buyer@example.com' } }), 'invalid');
    await rejects(gateway.decide(request!.id, { decision: 'approve', ...owner, confirmation: { amount_minor: 5900, recipient: 'someone@else.example' } }), 'invalid');
    const done = await gateway.decide(request!.id, { decision: 'approve', ...owner, confirmation: { amount_minor: 5900, recipient: 'buyer@example.com' } });
    expect(done.action.status).toBe('executed');
    expect(done.action.result).toHaveProperty('refund_ref');
  });

  it('makes a large amount wait for a second check', async () => {
    await setPolicy(db, 'approvals.second_check_minor', { JOD: null, USD: 10_000 }, OWNER);
    const { request } = await gateway.propose({ type: 'payments.refund', payload: refund({ amount_minor: 19_900, refund_id: '33333333-3333-4333-8333-333333333333' }), requester: { kind: 'agent', id: 'finance' } });
    const confirmation = { amount_minor: 19_900, recipient: 'buyer@example.com' };
    await rejects(gateway.decide(request!.id, { decision: 'approve', ...owner, confirmation }), 'conflict');
    clock.advance(25);
    const done = await gateway.decide(request!.id, { decision: 'approve', ...owner, confirmation });
    expect(done.action.status).toBe('executed');
    await setPolicy(db, 'approvals.second_check_minor', { JOD: null, USD: null }, OWNER);
  });
});

describe('pause', () => {
  it('holds an approved action, and runs it only after the owner ends the pause', async () => {
    const { request } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Held by pause' }), requester: SALES });
    await pause(db, { scope: 'global' }, 'Something looks wrong.', { kind: 'agent', id: 'security' });
    const held = await gateway.decide(request!.id, { decision: 'approve', ...owner });
    expect(held.action.status).toBe('approved');
    expect(held.action.held_reason).toMatch(/^paused: global/);
    expect((await listMockDeliveries(db, 'gmail')).some((d) => d.payload.subject === 'Held by pause')).toBe(false);

    await rejects(resume(db, { scope: 'global' }, { kind: 'agent', id: 'security' }, false), 'forbidden');
    expect((await gateway.releaseHeld()).every((a) => a.status === 'approved')).toBe(true);

    await resume(db, { scope: 'global' }, OWNER, true);
    const released = await gateway.releaseHeld();
    expect(released.map((a) => a.status)).toContain('executed');
    expect((await listMockDeliveries(db, 'gmail')).some((d) => d.payload.subject === 'Held by pause')).toBe(true);
  });

  it('holds even a Level 1 action while everything is paused', async () => {
    await pause(db, { scope: 'global' }, 'test', OWNER);
    const { action } = await gateway.propose({ type: 'gmail.create_draft', payload: email({ subject: 'Draft during pause' }), requester: SALES });
    expect(action.status).toBe('auto_approved');
    expect(action.held_reason).toMatch(/^paused/);
    await resume(db, { scope: 'global' }, OWNER, true);
    expect((await gateway.releaseHeld()).map((a) => a.status)).toEqual(['executed']);
  });
});

describe('standing rules', () => {
  const inAWeek = (): Date => new Date(clock.now().getTime() + 7 * 86_400_000);
  const base = { conditions: {}, spendLimitPerActionMinor: 0, spendLimitPerPeriodMinor: 0, recipientLimitPerPeriod: 2, period: 'day' as const };

  it('can be created only by the owner, and never for a Level 3 or a never-delegable action', async () => {
    const rule = { ...base, name: 'Templated replies', actionType: 'gmail.send_email', expiresAt: inAWeek() };
    await rejects(createRule(db, rule, SALES, false, clock.now()), 'forbidden');
    await rejects(createRule(db, { ...rule, actionType: 'payments.refund' }, OWNER, true, clock.now()), 'forbidden');
    await rejects(createRule(db, { ...rule, actionType: 'data.delete' }, OWNER, true, clock.now()), 'forbidden');
    await rejects(createRule(db, { ...rule, expiresAt: new Date(clock.now().getTime() + 90 * 86_400_000) }, OWNER, true, clock.now()), 'invalid');
    await rejects(createRule(db, { ...rule, recipientLimitPerPeriod: 0 }, OWNER, true, clock.now()), 'invalid');
  });

  it('covers a matching action up to its limit, then asks again', async () => {
    await createRule(db, { ...base, name: 'Feedback requests', actionType: 'gmail.send_email', conditions: { template: 'feedback-request' }, expiresAt: inAWeek() }, OWNER, true, clock.now());
    const send = (n: number) => gateway.propose({ type: 'gmail.send_email', payload: email({ subject: `Feedback ${n}`, template: 'feedback-request' }), requester: SUPPORT });
    const first = await send(1);
    const second = await send(2);
    const third = await send(3);
    expect(first.action.status).toBe('executed');
    expect(first.action.reasons).toContain('standing_rule');
    expect(second.action.status).toBe('executed');
    expect(third.action.status).toBe('pending');

    const other = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'No template' }), requester: SUPPORT });
    expect(other.action.status).toBe('pending');
  });

  it('never covers an action from an agent that has just read outside content', async () => {
    clock.advance(24);
    const covered = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'Clean run', template: 'feedback-request' }), requester: SUPPORT });
    expect(covered.action.status).toBe('executed');

    await gateway.noteOutsideContentRead('support', 'message:test');
    const tainted = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'After reading mail', template: 'feedback-request' }), requester: SUPPORT });
    expect(tainted.action.status).toBe('pending');
    expect(tainted.action.untrusted_input).toBe(true);
    expect(tainted.action.reasons).toContain('untrusted_input');
  });

  it('suspends itself when its actions keep failing', async () => {
    clock.advance(48);
    const rule = await createRule(db, { ...base, name: 'Order notices', actionType: 'whatsapp.send_message', conditions: { template: 'order-update' }, recipientLimitPerPeriod: 10, maxFailures: 2, expiresAt: inAWeek() }, OWNER, true, clock.now());
    mocks.whatsapp!.failNext('rate limited', 2);
    const send = (n: number) => gateway.propose({ type: 'whatsapp.send_message', payload: { to: '+962700000000', body: `Update ${n}`, locale: 'ar', template: 'order-update' }, requester: SUPPORT });
    expect((await send(1)).action.status).toBe('failed');
    expect((await send(2)).action.status).toBe('failed');
    const [after] = await db.query<{ status: string }>('select status from standing_rules where id = $1', [rule.id]);
    expect(after?.status).toBe('suspended');
    expect((await send(3)).action.status).toBe('pending');
  });
});

describe('integrity', () => {
  it('finds the same action again instead of creating a duplicate', async () => {
    const payload = email({ subject: 'Only once' });
    const first = await gateway.propose({ type: 'gmail.send_email', payload, requester: SALES });
    const again = await gateway.propose({ type: 'gmail.send_email', payload, requester: SALES });
    expect(again.duplicate).toBe(true);
    expect(again.action.id).toBe(first.action.id);
  });

  it('retries a failed action safely', async () => {
    mocks.gmail!.failNext('timeout');
    const { action } = await gateway.propose({ type: 'gmail.create_draft', payload: email({ subject: 'Retry' }), requester: SALES });
    expect(action.status).toBe('failed');
    expect(action.error).toBe('timeout');
    const retried = await gateway.execute(action.id);
    expect(retried.status).toBe('executed');
    expect(retried.attempts).toBe(2);
    expect((await listMockDeliveries(db, 'gmail')).filter((d) => d.payload.subject === 'Retry')).toHaveLength(1);
  });

  it('refuses to run an action that has no approval', async () => {
    const { action } = await gateway.propose({ type: 'gmail.send_email', payload: email({ subject: 'No approval' }), requester: SALES });
    await rejects(gateway.execute(action.id), 'conflict');
  });

  it('keeps an audit chain that cannot be edited', async () => {
    expect(await verifyAuditChain(db)).toBeNull();
    const [count] = await db.query<{ n: number }>('select count(*)::int as n from audit_events');
    expect(count!.n).toBeGreaterThan(30);
    await expect(db.query(`update audit_events set event_type = 'x' where seq = 1`)).rejects.toThrow(/append-only/);
    await expect(db.query('delete from audit_events where seq = 1')).rejects.toThrow(/append-only/);
    await expect(db.query('truncate audit_events')).rejects.toThrow(/append-only/);
  });
});
