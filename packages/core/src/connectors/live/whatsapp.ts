import { hmacSha256, sameSignature } from '../../lib/hash';
import { type Fetch, LiveConnector, request, unknownAction } from './base';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface WhatsAppCredentials {
  phone_number_id: string;
  access_token: string;
  app_secret: string;
  verify_token: string;
}

export class WhatsAppConnector extends LiveConnector {
  readonly id = 'whatsapp';

  constructor(
    private readonly creds: WhatsAppCredentials,
    private readonly fetcher: Fetch,
  ) {
    super();
  }

  private api<T>(path: string, init: RequestInit = {}): Promise<T> {
    return request<T>(this.fetcher, 'WhatsApp', `${GRAPH}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.creds.access_token}`, 'content-type': 'application/json' },
    });
  }

  protected async call(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (actionType !== 'whatsapp.send_message') throw unknownAction(this.id, actionType);
    const sent = await this.api<{ messages?: Array<{ id: string }> }>(`/${this.creds.phone_number_id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(payload.to).replace(/[^\d]/g, ''),
        type: 'text',
        text: { body: String(payload.body), preview_url: false },
      }),
    });
    return { message_id: sent.messages?.[0]?.id ?? null };
  }

  async health(): Promise<{ ok: boolean; note: string }> {
    try {
      const phone = await this.api<{ display_phone_number?: string; verified_name?: string }>(
        `/${this.creds.phone_number_id}?fields=display_phone_number,verified_name`,
      );
      return {
        ok: true,
        note: `Connected to ${phone.display_phone_number ?? 'the number'} (${phone.verified_name ?? 'unverified name'}).`,
      };
    } catch (error) {
      return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** Meta signs each webhook with the app secret: `sha256=<hex>` in X-Hub-Signature-256. */
export const whatsappSignatureOk = (appSecret: string, rawBody: string, header: string | undefined): boolean =>
  Boolean(header?.startsWith('sha256=')) && sameSignature(header!.slice(7), hmacSha256(appSecret, rawBody));

/** The text messages in one webhook delivery. Other kinds (status updates, pictures) are skipped. */
export function whatsappMessages(body: unknown): Array<{ id: string; from: string; text: string }> {
  const out: Array<{ id: string; from: string; text: string }> = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] })?.changes ?? []) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      for (const m of value?.messages ?? []) {
        const message = m as { id?: string; from?: string; type?: string; text?: { body?: string } };
        if (message.type === 'text' && message.id && message.from && message.text?.body)
          out.push({ id: message.id, from: `+${message.from.replace(/[^\d]/g, '')}`, text: message.text.body });
      }
    }
  }
  return out;
}
