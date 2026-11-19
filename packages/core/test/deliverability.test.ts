import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../src/api/index';
import { DEMO_OWNER_ID } from '../src/company';
import { expiringConnections, writeConnection } from '../src/connectors/connections';
import { buildMime } from '../src/connectors/live/gmail';
import { recordInbound } from '../src/crm/crm';
import { bounceRate, isBounceNotice, optOut, safeSendLimit } from '../src/crm/deliverability';
import { createTestPlatform, type TestPlatform } from './helpers/platform';

/**
 * Keeping the owner's mailbox in good standing: bounced addresses are never written to again, every sales email can
 * be stopped in one click, a high bounce rate halves the daily limit, and keys about to expire are flagged.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestPlatform;
const now = new Date();

beforeAll(async () => {
  t = await createTestPlatform();
  await t.platform.db.query(`create schema if not exists ops`);
  await t.platform.db.query(
    `create table if not exists ops.secrets (name text primary key, value text not null, created_at timestamptz not null default now())`,
  );
});
afterAll(async () => t.test.drop());

async function prospect(email: string, sent: boolean): Promise<Json> {
  const [lead] = await t.platform.db.query<Json>(
    `insert into leads (name, email, message, source, kind, sequence, next_step_at, last_contact_at)
     values ('Team', $1, 'Prospect', 'owner', 'prospect', 'outreach', $2, $2) returning *`,
    [email, now],
  );
  if (sent)
    await t.platform.db.query(
      `insert into actions (action_type, connector, level, status, payload, payload_hash, summary, recipient,
         requested_by_kind, idempotency_key, executed_at)
       values ('gmail.send_email', 'gmail', 2, 'executed', '{}', repeat('a', 64), 'Sent', $1, 'agent', $2, $3)`,
      [email, `test-sent:${email}`, now],
    );
  return lead!;
}

describe('bounce notices', () => {
  it('knows a mail server notice from an ordinary email', () => {
    expect(
      isBounceNotice({ from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)' }),
    ).toBe(true);
    expect(isBounceNotice({ from: 'postmaster@outlook.com', subject: 'Undeliverable: Hello' })).toBe(true);
    expect(isBounceNotice({ from: 'rana@example.com', subject: 'Delivery Status Notification (Failure)' })).toBe(false);
    expect(isBounceNotice({ from: 'mailer-daemon@googlemail.com', subject: 'Your weekly digest' })).toBe(false);
  });

  it('stops every email to a bounced address, and sends the notice to nobody', async () => {
    const lead = await prospect('info@gone.example', true);
    const untouched = await prospect('info@never-written.example', false);
    const saved = await recordInbound(t.platform.db, {
      channel: 'email',
      from: 'mailer-daemon@googlemail.com',
      subject: 'Delivery Status Notification (Failure)',
      body: "Your message wasn't delivered to info@gone.example or info@never-written.example because the address couldn't be found.",
      locale: 'en',
    });
    const [after] = await t.platform.db.query<Json>('select * from leads where id = $1', [lead.id]);
    expect(after).toMatchObject({ do_not_contact: true, sequence: null, next_step_at: null });
    expect(after!.bounced_at).not.toBeNull();
    // An address Sales never really sent to (an email still waiting counts as not sent) is left alone, so a forged
    // notice cannot silence it.
    const [other] = await t.platform.db.query<Json>('select * from leads where id = $1', [untouched.id]);
    expect(other).toMatchObject({ do_not_contact: false, bounced_at: null });
    const [message] = await t.platform.db.query<Json>('select handled from messages where id = $1', [saved.id]);
    expect(message!.handled).toBe(true);
    expect(await t.platform.db.query(`select 1 from jobs where kind = 'support.triage'`)).toHaveLength(0);
  });
});

describe('the bounce rate', () => {
  it('halves the daily limit once more than 5% of 20 or more recent addresses bounced', async () => {
    for (let i = 0; i < 20; i += 1) await prospect(`ok${i}@fine.example`, true);
    // 1 bounced of 21 sent to: under 5%.
    expect(await safeSendLimit(t.platform.db, 15, now)).toEqual({ limit: 15, halved: false });
    for (const i of [1, 2]) {
      await t.platform.db.query(`update leads set bounced_at = $2 where email = $1`, [`ok${i}@fine.example`, now]);
    }
    const rate = await bounceRate(t.platform.db, now);
    expect(rate).toMatchObject({ contacted: 21, bounced: 3 });
    expect(await safeSendLimit(t.platform.db, 15, now)).toEqual({ limit: 7, halved: true });
  });
});

describe('the one-click unsubscribe', () => {
  it('stops the lead from the mail app button, and ignores a link it does not know', async () => {
    const lead = await prospect('stop@me.example', true);
    const { action: waiting } = await t.platform.gateway.propose({
      type: 'gmail.send_email',
      payload: { to: 'stop@me.example', subject: 'Hi', body: 'Hello', locale: 'en' },
      requester: { kind: 'agent', id: 'sales' },
      evidence: [],
    });
    expect(waiting.status).toBe('pending');
    const api = createApi(t.platform, { ownerToken: 'owner-test', ownerUserId: DEMO_OWNER_ID, agentTokens: {} });
    const response = await api({
      method: 'POST',
      path: `/api/public/unsubscribe/${lead.opt_out_token}`,
      query: {},
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.5' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(response).toMatchObject({ status: 200, body: { done: true } });
    const status = await api({
      method: 'GET',
      path: `/api/public/unsubscribe/${lead.opt_out_token}`,
      query: {},
      headers: { 'x-forwarded-for': '203.0.113.5' },
      body: '',
    });
    expect(status.body).toEqual({ stopped: true });
    const [after] = await t.platform.db.query<Json>('select * from leads where id = $1', [lead.id]);
    expect(after).toMatchObject({ do_not_contact: true, sequence: null });
    // The email still waiting in Approvals can no longer be sent.
    const [withdrawn] = await t.platform.db.query<Json>('select status from actions where id = $1', [waiting.id]);
    expect(withdrawn!.status).toBe('expired');
    expect(await optOut(t.platform.db, '00000000-0000-4000-8000-000000000000', now)).toBe(false);
    expect(await optOut(t.platform.db, '-'.repeat(36), now)).toBe(false);
    expect(await optOut(t.platform.db, 'not-a-token', now)).toBe(false);
  });

  it('puts the unsubscribe headers on the email', () => {
    const raw = buildMime({
      from: 'me@example.com',
      to: 'you@example.com',
      subject: 'Hi',
      body: 'Hello',
      unsubscribeUrl: 'https://shop.example.test/api/public/unsubscribe/abc',
    });
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('List-Unsubscribe: <https://shop.example.test/api/public/unsubscribe/abc>');
    expect(mime).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(
      Buffer.from(buildMime({ from: 'a@b.co', to: 'c@d.co', subject: 's', body: 'b' }), 'base64url').toString(),
    ).not.toContain('List-Unsubscribe');
  });
});

describe('keys about to expire', () => {
  it('lists a connected key whose date is a week away or past', async () => {
    await writeConnection(t.platform.db, 'buffer', { api_key: 'k', channels: '{}', expires_on: day(5) });
    await writeConnection(t.platform.db, 'github', { token: 'g', expires_on: day(60) });
    expect(await expiringConnections(t.platform.db, now, 7)).toEqual([{ id: 'buffer', expires_on: day(5) }]);
  });
});

function day(offset: number): string {
  return new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}
