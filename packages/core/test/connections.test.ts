import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi, type ApiResponse } from '../src/api/index';
import { DEMO_OWNER_ID } from '../src/company';
import type { Fetch } from '../src/connectors/live/base';
import { buildMime, GmailConnector, textOf } from '../src/connectors/live/gmail';
import { paytabsEvent } from '../src/connectors/live/paytabs';
import { whatsappMessages } from '../src/connectors/live/whatsapp';
import { finishGoogleSignIn, refreshConnectors, syncGmail, whatsappVerify } from '../src/connectors/registry';
import { hmacSha256 } from '../src/lib/hash';
import { createTestPlatform, OWNER, type TestPlatform } from './helpers/platform';

/**
 * Live connectors (blueprint 9.1): the owner connects each account from the owner app, its keys stay on the server,
 * and every call to a provider goes through the same gateway, once per idempotency key. No test reaches a real
 * provider: a fake fetch answers as each provider would and records what was asked.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Answer =
  { status?: number; body: unknown } | ((url: string, init: RequestInit) => { status?: number; body: unknown });

const OWNER_TOKEN = 'owner-test-token';
const calls: Array<{ method: string; url: string; body: string; headers: Record<string, string> }> = [];
const answers: Array<[RegExp, Answer]> = [];
const answer = (pattern: RegExp, reply: Answer): void => void answers.unshift([pattern, reply]);

const fakeFetch: Fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? init.body : init.body ? String(init.body) : '';
  calls.push({ method, url, body, headers: (init.headers ?? {}) as Record<string, string> });
  const found = answers.find(([pattern]) => pattern.test(`${method} ${url}`));
  if (!found) return new Response(JSON.stringify({ message: `no fake for ${method} ${url}` }), { status: 404 });
  const reply = typeof found[1] === 'function' ? found[1](url, init) : found[1];
  return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
};

let t: TestPlatform;
let call: (
  method: string,
  path: string,
  options?: { body?: unknown; token?: string | null; raw?: string; headers?: Record<string, string> },
) => Promise<ApiResponse & { body: Json }>;

beforeAll(async () => {
  t = await createTestPlatform({ fetch: fakeFetch });
  await t.platform.db.query(`create schema if not exists ops`);
  await t.platform.db.query(
    `create table if not exists ops.secrets (name text primary key, value text not null, created_at timestamptz not null default now())`,
  );
  await refreshConnectors(t.platform);
  const api = createApi(t.platform, { ownerToken: OWNER_TOKEN, ownerUserId: DEMO_OWNER_ID, agentTokens: {} });
  call = async (method, path, options = {}) => {
    const [pathname, search = ''] = path.split('?');
    const headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.9', ...options.headers };
    const token = options.token === undefined ? OWNER_TOKEN : options.token;
    if (token) headers.authorization = `Bearer ${token}`;
    return (await api({
      method,
      path: pathname!,
      query: Object.fromEntries(new URLSearchParams(search)),
      headers,
      body: options.raw ?? (options.body === undefined ? '' : JSON.stringify(options.body)),
    })) as ApiResponse & { body: Json };
  };
});
afterAll(async () => t.test.drop());

const connection = async (id: string): Promise<Json> =>
  (await call('GET', '/api/owner/connections')).body.connections.find((c: Json) => c.id === id);

describe('the connections page', () => {
  it('starts with every account on its mock, and lists the steps and addresses to copy', async () => {
    const list = (await call('GET', '/api/owner/connections')).body.connections as Json[];
    expect(list.map((c) => c.id)).toEqual(['gmail', 'github', 'vercel', 'buffer', 'whatsapp', 'payments', 'gumroad']);
    expect(list.every((c) => c.mode === 'mock')).toBe(true);
    const gmail = list[0]!;
    expect(gmail.sign_in).toBe('google');
    expect(gmail.addresses[0].value).toBe('https://shop.example.test/api/connect/gmail/callback');
  });

  it('refuses a stranger, a value with a space, a field it does not take and a field the platform fills in', async () => {
    expect(
      (await call('PUT', '/api/owner/connections/github', { body: { values: { token: 'x' } }, token: null })).status,
    ).toBe(401);
    expect(
      (await call('PUT', '/api/owner/connections/github', { body: { values: { token: 'abc def' } } })).status,
    ).toBe(422);
    expect((await call('PUT', '/api/owner/connections/github', { body: { values: { password: 'x' } } })).status).toBe(
      422,
    );
    expect(
      (await call('PUT', '/api/owner/connections/gmail', { body: { values: { refresh_token: 'x' } } })).status,
    ).toBe(422);
    expect(
      (await call('PUT', '/api/owner/connections/gmail', { body: { values: { client_id: 'not-a-client' } } })).status,
    ).toBe(422);
    expect((await call('PUT', '/api/owner/connections/nope', { body: { values: { token: 'x' } } })).status).toBe(422);
  });
});

describe('GitHub', () => {
  it('goes live with a token, never shows the token again, and makes an issue once however often it is retried', async () => {
    answer(/GET https:\/\/api\.github\.com\/user$/, { body: { login: 'abu-arandas' } });
    answer(/POST https:\/\/api\.github\.com\/repos\/abu-arandas\/arandastech\/issues$/, {
      status: 201,
      body: { number: 42, html_url: 'https://github.com/abu-arandas/arandastech/issues/42' },
    });
    const saved = await call('PUT', '/api/owner/connections/github', {
      body: { values: { token: 'github_pat_SECRET123' } },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ mode: 'live', health: { ok: true, note: 'Connected as abu-arandas.' } });

    const listed = await call('GET', '/api/owner/connections');
    expect(JSON.stringify(listed.body)).not.toContain('SECRET123');
    expect((await connection('github')).fields[0]).toMatchObject({ key: 'token', set: true, value: null });

    const { action } = await t.platform.gateway.propose({
      type: 'github.create_issue',
      payload: { repository: 'abu-arandas/arandastech', title: 'Checkout feature', body: 'Plan', public: false },
      requester: { kind: 'agent', id: 'engineering' },
    });
    expect(action.status).toBe('executed');
    expect(action.result).toMatchObject({ number: 42 });
    const issueCalls = () => calls.filter((c) => c.url.endsWith('/issues')).length;
    expect(issueCalls()).toBe(1);
    expect(calls.find((c) => c.url.endsWith('/issues'))!.headers.authorization).toBe('Bearer github_pat_SECRET123');

    // A retry of the same action returns the first result and does not reach GitHub again.
    const again = await t.platform.connectors.github!.execute('github.create_issue', action.payload, {
      db: t.platform.db,
      idempotencyKey: action.idempotency_key,
    });
    expect(again).toMatchObject({ number: 42 });
    expect(issueCalls()).toBe(1);
  });

  it('shows what GitHub said when it refuses, and goes back to the mock when disconnected', async () => {
    answer(/GET https:\/\/api\.github\.com\/user$/, { status: 401, body: { message: 'Bad credentials' } });
    const checked = await call('POST', '/api/owner/connections/github/check');
    expect(checked.body.health).toEqual({ ok: false, note: 'GitHub answered 401: Bad credentials' });
    expect((await connection('github')).last_error).toContain('Bad credentials');

    expect((await call('POST', '/api/owner/connections/github/disconnect')).body).toEqual({ mode: 'mock' });
    expect((await connection('github')).mode).toBe('mock');
    expect(t.platform.connectors.github).toBe(t.mocks.github);
  });
});

describe('Gmail', () => {
  const CLIENT = '123-abc.apps.googleusercontent.com';

  it('needs Google sign-in after the client is saved, and keeps the sign-in it gets back', async () => {
    const saved = await call('PUT', '/api/owner/connections/gmail', {
      body: { values: { client_id: CLIENT, client_secret: 'GOCSPX-secret' } },
    });
    expect(saved.body.mode).toBe('mock');

    const started = await call('POST', '/api/owner/connections/gmail/sign-in');
    const url = new URL(started.body.url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe(CLIENT);
    expect(url.searchParams.get('redirect_uri')).toBe('https://shop.example.test/api/connect/gmail/callback');
    expect(url.searchParams.get('access_type')).toBe('offline');
    const state = url.searchParams.get('state')!;

    answer(/POST https:\/\/oauth2\.googleapis\.com\/token$/, (_url, init) =>
      String(init.body).includes('grant_type=authorization_code')
        ? { body: { access_token: 'at-1', refresh_token: 'rt-SECRET', expires_in: 3600 } }
        : { body: { access_token: 'at-2', expires_in: 3600 } },
    );
    answer(/GET https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile$/, {
      body: { emailAddress: 'hello@zirr.test' },
    });

    // A wrong state is refused, and the right one cannot be used twice.
    await expect(
      finishGoogleSignIn(t.platform, {
        code: 'c',
        state: 'forged',
        redirectUri: 'https://shop.example.test/api/connect/gmail/callback',
      }),
    ).rejects.toThrow(/expired/);
    await call('POST', '/api/owner/connections/gmail/sign-in').then((r) => {
      const fresh = new URL(r.body.url).searchParams.get('state')!;
      return finishGoogleSignIn(t.platform, {
        code: 'c',
        state: fresh,
        redirectUri: 'https://shop.example.test/api/connect/gmail/callback',
      });
    });
    await expect(
      finishGoogleSignIn(t.platform, {
        code: 'c',
        state,
        redirectUri: 'https://shop.example.test/api/connect/gmail/callback',
      }),
    ).rejects.toThrow(/expired/);

    const gmail = await connection('gmail');
    expect(gmail.mode).toBe('live');
    expect(gmail.fields.find((f: Json) => f.key === 'address').value).toBe('hello@zirr.test');
    expect(JSON.stringify(gmail)).not.toContain('rt-SECRET');
    expect(JSON.stringify(gmail)).not.toContain('GOCSPX-secret');
  });

  it('reads new mail once, skips its own, and hands each email to Support', async () => {
    answer(/GET https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\?/, {
      body: { messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] },
    });
    const mail = (id: string, from: string, subject: string, text: string) => ({
      id,
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: from },
          { name: 'Subject', value: subject },
        ],
        parts: [{ mimeType: 'text/plain', body: { data: Buffer.from(text).toString('base64url') } }],
      },
    });
    answer(/messages\/m1\?format=full$/, {
      body: mail('m1', 'Sara <Sara@Example.com>', 'Licence question', 'Does the licence cover two shops?'),
    });
    answer(/messages\/m2\?format=full$/, { body: mail('m2', 'hello@zirr.test', 'Sent by me', 'ignore') });
    answer(/messages\/m3\?format=full$/, { body: mail('m3', 'omar@example.com', 'سؤال', 'هل يعمل التطبيق بالعربية؟') });

    expect(await syncGmail(t.platform, { force: true })).toEqual({ read: 2 });
    expect(await syncGmail(t.platform, { force: true })).toEqual({ read: 0 });
    expect((await syncGmail(t.platform)).skipped).toMatch(/less than a minute/);

    const rows = await t.platform.db.query<Json>(
      `select from_address, locale, external_id from messages where channel = 'email' and external_id is not null order by external_id`,
    );
    expect(rows).toEqual([
      { from_address: 'sara@example.com', locale: 'en', external_id: 'm1' },
      { from_address: 'omar@example.com', locale: 'ar', external_id: 'm3' },
    ]);
    const jobs = await t.platform.db.query<Json>(`select count(*)::int as n from jobs where kind = 'support.triage'`);
    expect(jobs[0]!.n).toBeGreaterThanOrEqual(2);
  });

  it('sends approved mail from the mailbox, and a standing rule never sends through a live account in demo mode', async () => {
    answer(/POST https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send$/, {
      body: { id: 'sent-1', threadId: 't-1' },
    });
    await t.platform.db
      .query(
        `insert into standing_rules (name, action_type, conditions, max_per_day, created_by, expires_at)
       values ('Mail anyone', 'gmail.send_email', '{}'::jsonb, 50, $1, now() + interval '30 days')`,
        [OWNER.id],
      )
      .catch(() => undefined);
    const { action, request } = await t.platform.gateway.propose({
      type: 'gmail.send_email',
      payload: { to: 'sara@example.com', subject: 'رد: سؤال', body: 'Yes, two shops.', locale: 'en' },
      requester: { kind: 'agent', id: 'support' },
    });
    expect(action.status).toBe('pending');
    expect(action.reasons).toContain('live_in_demo');

    const decided = await t.platform.gateway.decide(request!.id, { decision: 'approve', by: OWNER, isOwner: true });
    expect(decided.action.status).toBe('executed');
    expect(decided.action.result).toEqual({ message_id: 'sent-1', thread_id: 't-1' });
    const sent = JSON.parse(calls.filter((c) => c.url.endsWith('/messages/send')).at(-1)!.body) as { raw: string };
    const mime = Buffer.from(sent.raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: hello@zirr.test');
    expect(mime).toContain('To: sara@example.com');
    expect(mime).toContain(`Subject: =?UTF-8?B?${Buffer.from('رد: سؤال').toString('base64')}?=`);
  });
});

describe('the pieces of an email', () => {
  it('keeps headers on one line, so no header can be added through a subject', () => {
    const raw = buildMime({ from: 'a@b.test', to: 'c@d.test', subject: 'Hi\r\nBcc: x@evil.test', body: 'x' });
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(mime).toContain('Subject: Hi Bcc: x@evil.test');
  });

  it('reads the HTML part when there is no plain one', () => {
    const html = Buffer.from('<p>Hello&nbsp;there</p><script>x()</script><div>Second</div>').toString('base64url');
    expect(textOf({ mimeType: 'text/html', body: { data: html } })).toBe('Hello there\nSecond');
    expect(
      new GmailConnector({ client_id: 'a', client_secret: 'b', refresh_token: 'c', address: 'd@e.test' }, fakeFetch)
        .address,
    ).toBe('d@e.test');
  });
});

describe('WhatsApp', () => {
  it('makes a verify token, answers Meta only with it, and records signed messages once', async () => {
    answer(/GET https:\/\/graph\.facebook\.com\/v21\.0\/1234567\?/, {
      body: { display_phone_number: '+962 7 9000 0000', verified_name: 'Zirr' },
    });
    const saved = await call('PUT', '/api/owner/connections/whatsapp', {
      body: { values: { phone_number_id: '1234567', access_token: 'EAAG-secret', app_secret: 'app-secret' } },
    });
    expect(saved.body.mode).toBe('live');
    const wa = await connection('whatsapp');
    const verify = wa.addresses.find((a: Json) => a.label === 'Verify token').value as string;
    expect(verify.length).toBeGreaterThan(20);

    expect(
      await whatsappVerify(t.platform, { 'hub.mode': 'subscribe', 'hub.verify_token': verify, 'hub.challenge': '99' }),
    ).toBe('99');
    await expect(
      whatsappVerify(t.platform, { 'hub.mode': 'subscribe', 'hub.verify_token': 'guess', 'hub.challenge': '99' }),
    ).rejects.toThrow();

    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'wamid.1', from: '962790000001', type: 'text', text: { body: 'مرحبا' } },
                  { id: 'wamid.2', from: '1', type: 'image' },
                ],
              },
            },
          ],
        },
      ],
    });
    const forged = await call('POST', '/api/webhooks/whatsapp', {
      raw: body,
      token: null,
      headers: { 'x-hub-signature-256': 'sha256=00' },
    });
    expect(forged.status).toBe(401);
    const signature = `sha256=${hmacSha256('app-secret', body)}`;
    const first = await call('POST', '/api/webhooks/whatsapp', {
      raw: body,
      token: null,
      headers: { 'x-hub-signature-256': signature },
    });
    expect(first.body).toEqual({ read: 1 });
    const again = await call('POST', '/api/webhooks/whatsapp', {
      raw: body,
      token: null,
      headers: { 'x-hub-signature-256': signature },
    });
    expect(again.body).toEqual({ read: 0 });
    const [row] = await t.platform.db.query<Json>(
      `select from_address, locale from messages where external_id = 'wamid.1'`,
    );
    expect(row).toEqual({ from_address: '+962790000001', locale: 'ar' });
  });

  it('skips what is not a text message', () => {
    expect(whatsappMessages({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(whatsappMessages(null)).toEqual([]);
  });
});

describe('PayTabs', () => {
  it('sends the buyer to PayTabs, counts only a signed approved callback, and closes the test payment', async () => {
    answer(/POST https:\/\/secure-jordan\.paytabs\.com\/payment\/query$/, {
      status: 400,
      body: { message: 'Transaction not found' },
    });
    answer(/POST https:\/\/secure-jordan\.paytabs\.com\/payment\/request$/, (_url, init) => {
      const sent = JSON.parse(String(init.body)) as Json;
      return {
        body: { tran_ref: 'TST2233', redirect_url: `https://secure-jordan.paytabs.com/payment/page/${sent.cart_id}` },
      };
    });
    expect((await call('GET', '/api/public/payments', { token: null })).body.provider).toBe('test');
    const saved = await call('PUT', '/api/owner/connections/payments', {
      body: { values: { profile_id: '188161', server_key: 'SJN-secret' } },
    });
    expect(saved.body).toMatchObject({ mode: 'live', health: { ok: true } });
    expect((await call('GET', '/api/public/payments', { token: null })).body.provider).toBe('paytabs');

    const { order, session } = await t.platform.store.createCheckout({
      items: [{ sku: 'RETAIL-DEV', quantity: 1 }],
      buyer: { name: 'Sara', email: 'sara@example.com' },
      locale: 'en',
      idempotencyKey: 'paytabs-test-1',
    });
    const page = await call('POST', '/api/public/pay', { body: { session, locale: 'ar' }, token: null });
    expect(page.body).toMatchObject({
      provider: 'paytabs',
      url: `https://secure-jordan.paytabs.com/payment/page/${session}`,
    });
    const asked = JSON.parse(calls.filter((c) => c.url.endsWith('/payment/request')).at(-1)!.body) as Json;
    expect(asked).toMatchObject({
      profile_id: 188161,
      tran_type: 'sale',
      cart_id: session,
      cart_currency: order.currency,
      callback: 'https://shop.example.test/api/webhooks/paytabs',
    });
    expect(calls.filter((c) => c.url.endsWith('/payment/request')).at(-1)!.headers.authorization).toBe('SJN-secret');

    // The test page can no longer mark an order paid.
    expect((await call('POST', '/api/demo/pay', { body: { session }, token: null })).status).toBe(409);

    const callback = JSON.stringify({
      tran_ref: 'TST2233',
      cart_id: session,
      cart_currency: order.currency,
      cart_amount: asked.cart_amount.toString(),
      payment_result: { response_status: 'A', response_message: 'Authorised' },
    });
    expect(
      (await call('POST', '/api/webhooks/paytabs', { raw: callback, token: null, headers: { signature: 'bad' } }))
        .status,
    ).toBe(401);
    const paid = await call('POST', '/api/webhooks/paytabs', {
      raw: callback,
      token: null,
      headers: { signature: hmacSha256('SJN-secret', callback) },
    });
    expect(paid.status).toBe(200);
    expect(paid.body.duplicate).toBe(false);
    const [row] = await t.platform.db.query<Json>(
      `select o.status, p.provider from orders o join payments p on p.order_id = o.id where o.id = $1`,
      [order.id],
    );
    expect(row!.provider).toBe('paytabs');
    expect(row!.status).not.toBe('pending_payment');
  });

  it('turns only an approved result into a payment', () => {
    expect(
      paytabsEvent({
        tran_ref: 'T1',
        cart_id: 's',
        cart_currency: 'JOD',
        cart_amount: '12.500',
        payment_result: { response_status: 'A' },
      }),
    ).toEqual({
      id: 'T1',
      type: 'payment.captured',
      data: { session: 's', payment_ref: 'T1', amount_minor: 12500, currency: 'JOD', provider: 'paytabs' },
    });
    expect(
      paytabsEvent({
        tran_ref: 'T2',
        cart_id: 's',
        cart_currency: 'JOD',
        cart_amount: '1',
        payment_result: { response_status: 'D' },
      })!.type,
    ).toBe('payment.declined');
    expect(paytabsEvent({ cart_id: 's' })).toBeNull();
  });
});

describe('Vercel and Buffer', () => {
  it('finds the Vercel team and the Buffer channels from the key alone', async () => {
    answer(/GET https:\/\/api\.vercel\.com\/v2\/teams/, { body: { teams: [{ id: 'team_abc' }] } });
    answer(/GET https:\/\/api\.vercel\.com\/v2\/user/, { body: { user: { username: 'abu-arandas' } } });
    expect(
      (await call('PUT', '/api/owner/connections/vercel', { body: { values: { token: 'vcp_secret' } } })).body.mode,
    ).toBe('live');
    expect((await connection('vercel')).fields.find((f: Json) => f.key === 'team_id').value).toBe('team_abc');
    expect(calls.filter((c) => c.url.includes('api.vercel.com/v2/user')).at(-1)!.url).toContain('teamId=team_abc');

    answer(/POST https:\/\/api\.buffer\.com$/, (_url, init) => {
      const query = String(JSON.parse(String(init.body)).query);
      if (query.includes('organizations'))
        return { body: { data: { account: { organizations: [{ id: '0123456789abcdef01234567' }] } } } };
      if (query.includes('channels'))
        return {
          body: {
            data: {
              channels: [
                { id: 'fb0000000000000000000001', service: 'facebook' },
                { id: 'li0000000000000000000001', service: 'linkedin' },
              ],
            },
          },
        };
      if (query.includes('createPost')) return { body: { data: { createPost: { post: { id: 'post-1' } } } } };
      return { body: { data: { account: { id: 'acc' } } } };
    });
    expect(
      (await call('PUT', '/api/owner/connections/buffer', { body: { values: { api_key: 'buf-secret' } } })).body.mode,
    ).toBe('live');
    const { action } = await t.platform.gateway.propose({
      type: 'buffer.create_draft',
      payload: { channel: 'facebook', text: 'New release', locale: 'en' },
      requester: { kind: 'agent', id: 'marketing' },
    });
    expect(action.result).toEqual({ post_id: 'post-1' });
    const posted = JSON.parse(calls.filter((c) => c.url === 'https://api.buffer.com').at(-1)!.body) as Json;
    expect(posted.variables.input).toMatchObject({
      channelId: 'fb0000000000000000000001',
      saveToDraft: true,
      metadata: { facebook: { type: 'post' } },
    });
  });
});

describe('live mode before PayTabs is connected', () => {
  it('takes no order that could not be paid', async () => {
    const live = await createTestPlatform({ demo: false, fetch: fakeFetch });
    try {
      await refreshConnectors(live.platform);
      const api = createApi(live.platform, { ownerToken: OWNER_TOKEN, ownerUserId: DEMO_OWNER_ID, agentTokens: {} });
      const ask = async (method: string, path: string, body?: unknown) =>
        (await api({
          method,
          path,
          query: {},
          headers: { 'x-forwarded-for': '203.0.113.10' },
          body: body === undefined ? '' : JSON.stringify(body),
        })) as ApiResponse & { body: Json };
      expect((await ask('GET', '/api/public/payments')).body.provider).toBe('none');
      const refused = await ask('POST', '/api/public/checkout', {
        items: [{ sku: 'RETAIL-DEV', quantity: 1 }],
        buyer: { name: 'Sara', email: 'sara@example.com' },
        locale: 'en',
        idempotencyKey: 'closed-1',
      });
      expect(refused.status).toBe(503);
      expect(refused.body.error.code).toBe('payments_closed');
      expect((await ask('POST', '/api/demo/pay', { session: 'x' })).status).toBe(404);
      expect(await live.platform.db.query(`select 1 from orders`)).toEqual([]);

      // The shop starts empty in live mode: the owner publishes each product, and confirms it in Approvals.
      expect((await ask('GET', '/api/public/catalog')).body.products).toEqual([]);
      await live.platform.db.query(
        `insert into staff_members (user_id, email, display_name, role) values ($1, 'o@example.test', 'Owner', 'owner')`,
        [DEMO_OWNER_ID],
      );
      const signed = async (method: string, path: string, body?: unknown) =>
        (await api({
          method,
          path,
          query: {},
          headers: { 'x-forwarded-for': '203.0.113.10', authorization: `Bearer ${OWNER_TOKEN}` },
          body: body === undefined ? '' : JSON.stringify(body),
        })) as ApiResponse & { body: Json };
      const products = (await signed('GET', '/api/owner/products')).body.products as Json[];
      const retail = products.find((p) => p.slug === 'zirr-retail');
      expect(retail).toMatchObject({ status: 'draft', is_test: false });
      expect(products.some((p) => p.is_test)).toBe(false);
      const asked = await signed('POST', `/api/owner/products/${retail!.id}/publish`);
      expect(asked.status).toBe(200);
      expect(asked.body.request).not.toBeNull();
      const decided = await signed('POST', `/api/owner/approvals/${asked.body.request.id}/decide`, {
        decision: 'approve',
      });
      expect(decided.status).toBe(200);
      const shop = (await ask('GET', '/api/public/catalog')).body.products as Json[];
      expect(shop.map((p) => p.slug)).toEqual(['zirr-retail']);
      const bad = await signed('POST', '/api/owner/products/not-a-product/publish');
      expect(bad.body.action.status).toBe('blocked');
    } finally {
      await live.test.drop();
    }
  });
});
