import { timingSafeEqual } from 'node:crypto';
import { readConnection } from '../connectors/connections';
import { audit } from '../governance/audit';
import { type Db, maybeOne, one } from '../lib/db';
import { AppError } from '../lib/errors';
import type { Actor } from '../lib/types';
import { createInvoice, type InvoiceRow } from './billing';

/**
 * Gumroad sales (the owner's licence shop). Gumroad pings the platform after each sale; the ping carries no signature,
 * so the address holds a secret key made by the platform, and the sale must name one of the owner's products (and his
 * seller ID, when it is saved). Each sale is recorded once: a paid invoice in the services books, the buyer as a client,
 * and the check-ins after 2 weeks and 2 months unless the buyer asked Gumroad not to be contacted. Gumroad sends the
 * receipt and the file itself, so the platform sends neither.
 */

const GUMROAD: Actor = { kind: 'automation', id: 'gumroad' };
const CURRENCIES = new Set(['USD', 'EUR', 'JOD']);

export interface GumroadSale {
  saleId: string;
  sellerId: string;
  product: string;
  productName: string;
  variant: string;
  email: string;
  name: string;
  amountMinor: number;
  currency: string;
  quantity: number;
  canContact: boolean;
  test: boolean;
}

/** Reads Gumroad's form-encoded ping. Anything missing or odd is refused, so a broken ping never records a sale. */
export function parsePing(body: string): GumroadSale {
  const form = new URLSearchParams(body);
  const text = (key: string): string => (form.get(key) ?? '').trim();
  const saleId = text('sale_id');
  const email = text('email').toLowerCase();
  const price = Number(text('price'));
  if (!saleId || !/^\S+@\S+\.\S+$/.test(email) || !Number.isSafeInteger(price) || price < 0)
    throw new AppError('invalid', 'The ping is missing the sale, the buyer or the price.', 400);
  const variant = [...form.entries()]
    .filter(([key]) => key.startsWith('variants['))
    .map(([, value]) => value.trim())
    .filter(Boolean)
    .join(', ');
  return {
    saleId: saleId.slice(0, 80),
    sellerId: text('seller_id'),
    product: productOf(text('product_permalink'), text('permalink'), text('short_product_id')),
    productName: (text('product_name') || 'Gumroad product').slice(0, 120),
    variant: variant.slice(0, 80),
    email,
    name: (text('full_name') || email.split('@')[0]!).slice(0, 120),
    amountMinor: price,
    currency: (text('currency') || 'usd').toUpperCase(),
    quantity: Math.max(1, Math.min(1000, Number(text('quantity')) || 1)),
    canContact: text('can_contact') !== 'false',
    test: text('test') === 'true',
  };
}

/** The product's own name in its link: "https://x.gumroad.com/l/zirr-retail" and "zirr-retail" both give zirr-retail. */
function productOf(...candidates: string[]): string {
  for (const value of candidates) {
    const last = value.split('?')[0]!.replace(/\/+$/, '').split('/').pop() ?? '';
    if (last) return last.toLowerCase();
  }
  return '';
}

function sameSecret(given: string, saved: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(saved);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What the ping must match: the secret key in its address, one of the owner's products, and his seller ID if saved. */
async function checkPing(db: Db, key: string, sale: GumroadSale): Promise<void> {
  const saved = await readConnection(db, 'gumroad');
  if (!saved.ping_key || !saved.products) throw new AppError('not_connected', 'Gumroad is not connected.', 404);
  if (!sameSecret(key, saved.ping_key)) throw new AppError('not_found', 'Not found.', 404);
  if (saved.seller_id && sale.sellerId !== saved.seller_id)
    throw new AppError('forbidden', 'This sale is from another Gumroad seller.', 403);
  const products = saved.products.split(',').map((p) => p.trim().toLowerCase());
  if (!sale.test && !products.includes(sale.product))
    throw new AppError('forbidden', 'This product is not one the platform counts.', 403);
}

export type PingResult =
  { recorded: true; invoice: string } | { recorded: false; reason: 'test' | 'duplicate' | 'free' | 'currency' };

/** Handles one ping. Gumroad repeats a ping that fails, so a repeat of a recorded sale is answered without change. */
export async function handleGumroadPing(db: Db, key: string, body: string, now: Date): Promise<PingResult> {
  const sale = parsePing(body);
  await checkPing(db, key, sale);
  if (sale.test) {
    await audit(db, { actor: GUMROAD, type: 'gumroad.test_ping', subject: { type: 'connector', id: 'gumroad' } });
    return { recorded: false, reason: 'test' };
  }
  if (sale.amountMinor === 0) return { recorded: false, reason: 'free' };
  if (!CURRENCIES.has(sale.currency)) {
    await audit(db, {
      actor: GUMROAD,
      type: 'gumroad.sale_not_recorded',
      subject: { type: 'connector', id: 'gumroad' },
      data: { sale_id: sale.saleId, currency: sale.currency, why: 'currency the books do not keep' },
    });
    return { recorded: false, reason: 'currency' };
  }
  return db.tx(async (tx) => {
    const claimed = await tx.query(
      `insert into gumroad_sales (sale_id, product, at) values ($1, $2, $3) on conflict (sale_id) do nothing returning sale_id`,
      [sale.saleId, sale.product, now],
    );
    if (!claimed.length) return { recorded: false, reason: 'duplicate' } as const;
    const invoice = await recordSale(tx, sale, now);
    await tx.query(`update gumroad_sales set invoice_id = $2 where sale_id = $1`, [sale.saleId, invoice.id]);
    return { recorded: true, invoice: invoice.number } as const;
  });
}

/** The buyer as a lead (found by email, or made), and the paid invoice that starts their check-ins. */
async function recordSale(db: Db, sale: GumroadSale, now: Date): Promise<InvoiceRow> {
  const leadId = await buyerLead(db, sale, now);
  const title = sale.variant ? `${sale.productName} (${sale.variant})` : sale.productName;
  const amount = (sale.amountMinor / 100).toFixed(2);
  return createInvoice(
    db,
    {
      lead_id: leadId,
      title: `Gumroad: ${title}`.slice(0, 160),
      items: [{ description: sale.quantity > 1 ? `${title} x ${sale.quantity}` : title, amount }],
      currency: sale.currency,
      paid_via: 'gumroad',
    },
    GUMROAD,
    now,
  );
}

async function buyerLead(db: Db, sale: GumroadSale, now: Date): Promise<string> {
  const known = maybeOne(
    await db.query<{ id: string }>(`select id from leads where lower(email) = $1 order by created_at limit 1`, [
      sale.email,
    ]),
  );
  if (known) return known.id;
  const lead = one(
    await db.query<{ id: string }>(
      `insert into leads (name, email, locale, message, source, stage, do_not_contact, created_at)
       values ($1, $2, 'en', $3, 'gumroad', 'won', $4, $5) returning id`,
      [sale.name, sale.email, `Bought ${sale.productName} on Gumroad.`, !sale.canContact, now],
    ),
  );
  return lead.id;
}
