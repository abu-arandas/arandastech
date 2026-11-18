import { hmacSha256, sameSignature } from '../../lib/hash';
import { toDecimal, toMinor } from '../../lib/money';
import { type Fetch, LiveConnector, request, unknownAction } from './base';

const REGIONS: Record<string, string> = {
  jor: 'https://secure-jordan.paytabs.com',
  are: 'https://secure.paytabs.com',
  sau: 'https://secure.paytabs.sa',
  egy: 'https://secure-egypt.paytabs.com',
  omn: 'https://secure-oman.paytabs.com',
  global: 'https://secure-global.paytabs.com',
};

export interface PayTabsCredentials {
  profile_id: string;
  server_key: string;
  region?: string;
}

interface PayTabsResult {
  tran_ref?: string;
  redirect_url?: string;
  payment_result?: { response_status?: string; response_message?: string };
}

/** PayTabs, the card provider for Jordan. Card details never touch the platform: buyers pay on PayTabs' own page. */
export class PayTabsConnector extends LiveConnector {
  readonly id = 'payments';

  constructor(
    private readonly creds: PayTabsCredentials,
    private readonly fetcher: Fetch,
  ) {
    super();
  }

  private get base(): string {
    return REGIONS[this.creds.region ?? 'jor'] ?? REGIONS.jor!;
  }

  private api<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return request<T>(this.fetcher, 'PayTabs', `${this.base}${path}`, {
      method: 'POST',
      headers: { authorization: this.creds.server_key, 'content-type': 'application/json' },
      body: JSON.stringify({ profile_id: Number(this.creds.profile_id), ...body }),
    });
  }

  /** A hosted payment page for one checkout. PayTabs calls `callback` when the payment is decided. */
  async paymentPage(input: {
    session: string;
    amountMinor: number;
    currency: string;
    description: string;
    buyer: { name: string; email: string };
    callback: string;
    returnUrl: string;
    locale: 'en' | 'ar';
  }): Promise<{ url: string; tran_ref: string }> {
    const page = await this.api<PayTabsResult>('/payment/request', {
      tran_type: 'sale',
      tran_class: 'ecom',
      cart_id: input.session,
      cart_currency: input.currency,
      cart_amount: Number(toDecimal(input.amountMinor, input.currency)),
      cart_description: input.description.slice(0, 120),
      paypage_lang: input.locale,
      customer_details: { name: input.buyer.name, email: input.buyer.email },
      hide_shipping: true,
      callback: input.callback,
      return: input.returnUrl,
    });
    if (!page.redirect_url || !page.tran_ref) throw new Error('PayTabs did not give a payment page.');
    return { url: page.redirect_url, tran_ref: page.tran_ref };
  }

  protected async call(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const amount = Number(toDecimal(Number(payload.amount_minor), String(payload.currency)));
    if (actionType === 'payments.refund') {
      const refund = await this.api<PayTabsResult>('/payment/request', {
        tran_type: 'refund',
        tran_class: 'ecom',
        tran_ref: payload.payment_ref,
        cart_id: `refund-${String(payload.refund_id)}`,
        cart_currency: payload.currency,
        cart_amount: amount,
        cart_description: String(payload.reason).slice(0, 120),
      });
      if (refund.payment_result?.response_status !== 'A')
        throw new Error(`PayTabs refused the refund: ${refund.payment_result?.response_message ?? 'no reason given'}`);
      return { refund_ref: refund.tran_ref ?? null };
    }
    if (actionType === 'payments.send_invoice') {
      const invoice = await this.api<{ invoice_id?: number; invoice_link?: string }>('/payment/invoice/new', {
        tran_type: 'sale',
        tran_class: 'ecom',
        cart_currency: payload.currency,
        cart_amount: amount,
        cart_id: `invoice-${Date.now()}`,
        cart_description: String(payload.description).slice(0, 120),
        customer_details: { email: payload.to, name: String(payload.to) },
        invoice: {
          lang: 'en',
          line_items: [
            {
              description: String(payload.description).slice(0, 120),
              unit_cost: amount,
              quantity: 1,
              net_total: amount,
            },
          ],
          total: amount,
        },
      });
      return { invoice_ref: invoice.invoice_id ?? null, invoice_link: invoice.invoice_link ?? null };
    }
    throw unknownAction(this.id, actionType);
  }

  async health(): Promise<{ ok: boolean; note: string }> {
    try {
      // Asking about a made-up payment proves the key and profile are accepted without moving money.
      await this.api('/payment/query', { tran_ref: 'TST0000000000000' }).catch((error: unknown) => {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403) throw error;
      });
      return { ok: true, note: `Connected to profile ${this.creds.profile_id}.` };
    } catch (error) {
      return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
  }

  /** PayTabs signs its callback with the server key: HMAC-SHA256 of the raw body, in the `signature` header. */
  signatureOk(rawBody: string, signature: string | undefined): boolean {
    return Boolean(signature) && sameSignature(signature!, hmacSha256(this.creds.server_key, rawBody));
  }
}

/** A PayTabs callback, as the store's payment notice. Only an approved payment counts. */
export function paytabsEvent(
  body: Record<string, unknown>,
): { id: string; type: string; data: Record<string, unknown> } | null {
  const tranRef = typeof body.tran_ref === 'string' ? body.tran_ref : null;
  const session = typeof body.cart_id === 'string' ? body.cart_id : null;
  const currency = typeof body.cart_currency === 'string' ? body.cart_currency : null;
  const amount = body.cart_amount;
  const status = (body.payment_result as { response_status?: string } | undefined)?.response_status;
  if (!tranRef || !session || !currency || (typeof amount !== 'string' && typeof amount !== 'number')) return null;
  if (status !== 'A') return { id: tranRef, type: 'payment.declined', data: { session, payment_ref: tranRef, status } };
  return {
    id: tranRef,
    type: 'payment.captured',
    data: {
      session,
      payment_ref: tranRef,
      amount_minor: toMinor(String(amount), currency),
      currency,
      provider: 'paytabs',
    },
  };
}
