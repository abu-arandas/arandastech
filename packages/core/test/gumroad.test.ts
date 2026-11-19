import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi, type ApiResponse } from '../src/api/index';
import { DEMO_OWNER_ID } from '../src/company';
import { parsePing } from '../src/crm/gumroad';
import { refreshConnectors } from '../src/connectors/registry';
import { createTestPlatform, type TestPlatform } from './helpers/platform';

/**
 * Gumroad sales: the owner connects his shop once, Gumroad pings the secret address after each sale, and the sale
 * becomes a paid invoice, a client and the check-ins, once, however often the ping is repeated.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OWNER_TOKEN = 'owner-test-token';
let t: TestPlatform;
let call: (
  method: string,
  path: string,
  options?: { body?: unknown; token?: string | null; raw?: string },
) => Promise<ApiResponse & { body: Json }>;

beforeAll(async () => {
  t = await createTestPlatform();
  await t.platform.db.query(`create schema if not exists ops`);
  await t.platform.db.query(
    `create table if not exists ops.secrets (name text primary key, value text not null, created_at timestamptz not null default now())`,
  );
  await refreshConnectors(t.platform);
  const api = createApi(t.platform, { ownerToken: OWNER_TOKEN, ownerUserId: DEMO_OWNER_ID, agentTokens: {} });
  call = async (method, path, options = {}) => {
    const headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.7' };
    const token = options.token === undefined ? OWNER_TOKEN : options.token;
    if (token) headers.authorization = `Bearer ${token}`;
    return (await api({
      method,
      path,
      query: {},
      headers,
      body: options.raw ?? (options.body === undefined ? '' : JSON.stringify(options.body)),
    })) as ApiResponse & { body: Json };
  };
});
afterAll(async () => t.test.drop());

const ping = (fields: Record<string, string>): string =>
  new URLSearchParams({
    sale_id: 'sale-1',
    seller_id: 'seller-abc',
    product_permalink: 'https://zirr.gumroad.com/l/zirr-retail',
    product_name: 'Zirr Retail',
    'variants[Licence]': 'Developer',
    email: 'Buyer@Example.com',
    full_name: 'Rana Haddad',
    price: '7900',
    quantity: '1',
    can_contact: 'true',
    test: 'false',
    ...fields,
  }).toString();

async function pingAddress(): Promise<string> {
  const list = (await call('GET', '/api/owner/connections')).body.connections as Json[];
  const gumroad = list.find((c) => c.id === 'gumroad')!;
  return new URL(gumroad.addresses[0].value).pathname;
}

describe('reading a ping', () => {
  it('takes the sale, the product from its link and the variant', () => {
    const sale = parsePing(ping({}));
    expect(sale).toMatchObject({
      saleId: 'sale-1',
      product: 'zirr-retail',
      variant: 'Developer',
      email: 'buyer@example.com',
      amountMinor: 7900,
      currency: 'USD',
      test: false,
    });
  });

  it('refuses a ping with no sale or price', () => {
    expect(() => parsePing('email=a%40b.co')).toThrow(/missing/);
  });
});

describe('Gumroad sales', () => {
  it('refuses pings until the shop is connected', async () => {
    const response = await call('POST', '/api/webhooks/gumroad/anything', { raw: ping({}), token: null });
    expect(response.status).toBe(404);
  });

  it('connects with the shop and products, makes the secret ping address, and shows it as live', async () => {
    const saved = await call('PUT', '/api/owner/connections/gumroad', {
      body: { values: { shop_url: 'https://zirr.gumroad.com', products: 'zirr-retail', seller_id: 'seller-abc' } },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.mode).toBe('live');
    expect(await pingAddress()).toMatch(/^\/api\/webhooks\/gumroad\/[\w-]{20,}$/);
    const payments = await call('GET', '/api/public/payments', { token: null });
    expect(payments.body.gumroad).toEqual({ shop_url: 'https://zirr.gumroad.com', products: ['zirr-retail'] });
  });

  it('refuses a wrong key, another seller and another product', async () => {
    const address = await pingAddress();
    expect((await call('POST', `${address}x`, { raw: ping({}), token: null })).status).toBe(404);
    expect((await call('POST', address, { raw: ping({ seller_id: 'other' }), token: null })).status).toBe(403);
    const other = ping({ product_permalink: 'https://zirr.gumroad.com/l/something-else' });
    expect((await call('POST', address, { raw: other, token: null })).status).toBe(403);
  });

  it('answers a test ping without recording a sale', async () => {
    const response = await call('POST', await pingAddress(), { raw: ping({ test: 'true' }), token: null });
    expect(response.body).toEqual({ recorded: false, reason: 'test' });
    expect(await t.platform.db.query('select 1 from invoices')).toHaveLength(0);
  });

  it('records a sale once as a paid invoice, a client and the check-ins', async () => {
    const address = await pingAddress();
    const first = await call('POST', address, { raw: ping({}), token: null });
    expect(first.status).toBe(200);
    expect(first.body.recorded).toBe(true);
    const again = await call('POST', address, { raw: ping({}), token: null });
    expect(again.body).toEqual({ recorded: false, reason: 'duplicate' });

    const invoices = await t.platform.db.query<Json>('select * from invoices');
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      status: 'paid',
      paid_via: 'gumroad',
      currency: 'USD',
      title: 'Gumroad: Zirr Retail (Developer)',
    });
    expect(Number(invoices[0]!.total_minor)).toBe(7900);
    const [lead] = await t.platform.db.query<Json>(`select * from leads where email = 'buyer@example.com'`);
    expect(lead).toMatchObject({ source: 'gumroad', stage: 'paid', sequence: 'check_in', do_not_contact: false });
    const ledger = await t.platform.db.query<Json>(`select * from ledger_entries where ref_id = $1`, [invoices[0]!.id]);
    expect(ledger.length).toBeGreaterThan(0);
    // Gumroad sends the receipt itself.
    expect(await t.platform.db.query(`select 1 from jobs where kind = 'sales.send_document'`)).toHaveLength(0);
  });

  it('leaves a buyer who asked not to be contacted out of the check-ins', async () => {
    const address = await pingAddress();
    const sale = ping({ sale_id: 'sale-2', email: 'quiet@example.com', can_contact: 'false' });
    expect((await call('POST', address, { raw: sale, token: null })).body.recorded).toBe(true);
    const [lead] = await t.platform.db.query<Json>(`select * from leads where email = 'quiet@example.com'`);
    expect(lead!.do_not_contact).toBe(true);
  });
});
