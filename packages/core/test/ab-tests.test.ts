import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chooseTemplate, decideTests, MIN_SENDS, testLine, testResults } from '../src/crm/ab-tests';
import { createTestPlatform, type TestPlatform } from './helpers/platform';

/**
 * A/B tests of the sales emails: both approved versions go out in turn, a reply counts for the last email before it,
 * and once each version reached enough people the one with more replies is kept and sent from then on.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestPlatform;
let sent = 0;
const now = new Date('2026-11-21T06:00:00Z');
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

beforeAll(async () => {
  t = await createTestPlatform();
});
afterAll(async () => t.test.drop());

async function lead(email: string, repliedAt: Date | null = null): Promise<string> {
  const [row] = await t.platform.db.query<Json>(
    `insert into leads (name, email, message, source, kind, replied_at) values ('Team', $1, 'Prospect', 'owner', 'prospect', $2)
     returning id`,
    [email, repliedAt],
  );
  return row!.id;
}

async function email(template: string, leadId: string, at: Date, status = 'executed'): Promise<void> {
  sent += 1;
  await t.platform.db.query(
    `insert into actions (action_type, connector, level, status, payload, payload_hash, summary, recipient,
       requested_by_kind, idempotency_key, executed_at)
     values ('gmail.send_email', 'gmail', 2, $1, $2::jsonb, repeat('a', 64), 'Sent', 'x@example.com', 'agent', $3, $4)`,
    [status, JSON.stringify({ template, lead_id: leadId }), `ab-test:${sent}`, status === 'executed' ? at : null],
  );
}

const approveB = (status: 'approved' | 'draft', template = 'shop-intro') =>
  t.platform.db.query(`update memory_items set status = $2 where key = $1`, [`template:${template}.b`, status]);

describe('which version goes out', () => {
  const evenLead = '00000000-0000-4000-8000-000000000002';
  const oddLead = '00000000-0000-4000-8000-00000000000b';

  it('sends only version A while version B waits for the owner', async () => {
    await approveB('draft');
    expect(await chooseTemplate(t.platform.db, 'shop-intro', oddLead)).toBe('shop-intro');
  });

  it('gives half the leads version B once both are approved, always the same version to the same lead', async () => {
    await approveB('approved');
    expect(await chooseTemplate(t.platform.db, 'shop-intro', oddLead)).toBe('shop-intro.b');
    expect(await chooseTemplate(t.platform.db, 'shop-intro', oddLead)).toBe('shop-intro.b');
    expect(await chooseTemplate(t.platform.db, 'shop-intro', evenLead)).toBe('shop-intro');
  });
});

describe('counting and keeping the winner', () => {
  it('credits a reply to the last email the lead got before replying', async () => {
    const both = await lead('both@agency.example', minutes(30));
    await email('prospect-intro', both, now);
    await email('prospect-follow-up', both, minutes(10));
    const late = await lead('late@agency.example', minutes(5));
    await email('prospect-intro.b', late, now);
    const [result] = (await testResults(t.platform.db)).filter((r) => r.template === 'prospect-intro');
    expect(result).toMatchObject({ a: { sends: 1, replies: 0 }, b: { sends: 1, replies: 1 }, winner: null });
  });

  it('waits for enough emails of each version, then keeps the one with more replies', async () => {
    expect(await decideTests(t.platform.db, now)).toEqual([]);
    for (let i = 1; i < MIN_SENDS; i += 1) {
      await email('prospect-intro', await lead(`a${i}@agency.example`, i <= 2 ? minutes(60) : null), now);
      await email('prospect-intro.b', await lead(`b${i}@agency.example`, i <= 4 ? minutes(60) : null), now);
    }
    const [decided] = await decideTests(t.platform.db, now);
    expect(decided).toMatchObject({
      template: 'prospect-intro',
      winner: 'prospect-intro.b',
      a: { sends: MIN_SENDS, replies: 2 },
      b: { sends: MIN_SENDS, replies: 5 },
    });
    for (const id of ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000b'])
      expect(await chooseTemplate(t.platform.db, 'prospect-intro', id)).toBe('prospect-intro.b');
    expect(await decideTests(t.platform.db, now)).toEqual([]);
    const [logged] = await t.platform.db.query<Json>(
      `select * from audit_events where event_type = 'sales.ab_test_decided'`,
    );
    expect(logged!.data.winner).toBe('prospect-intro.b');
  });

  it('keeps showing the counts the test was decided on, even after a late reply', async () => {
    await t.platform.db.query(`update leads set replied_at = $2 where email = $1`, ['a3@agency.example', minutes(90)]);
    const [result] = (await testResults(t.platform.db)).filter((r) => r.template === 'prospect-intro');
    expect(result!.a).toEqual({ sends: MIN_SENDS, replies: 2 });
  });

  it('says where each test stands in the briefing, in both languages', async () => {
    const [result] = (await testResults(t.platform.db)).filter((r) => r.template === 'prospect-intro');
    expect(testLine(result!, 'en')).toBe('- Test prospect-intro: version B won (replies: A 2/40, B 5/40).');
    expect(testLine(result!, 'ar')).toContain('فازت النسخة B');
  });
});
