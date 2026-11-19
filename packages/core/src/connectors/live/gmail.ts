import { type Fetch, LiveConnector, request, unknownAction } from './base';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

export interface GmailCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  address: string;
}

/** Google's sign-in page for the owner's mailbox. Offline access gives a refresh token the platform keeps. */
export function googleSignInUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Trades the code from Google's sign-in for a refresh token and the mailbox address. */
export async function exchangeGoogleCode(
  fetcher: Fetch,
  creds: { client_id: string; client_secret: string },
  code: string,
  redirectUri: string,
): Promise<{ refresh_token: string; address: string }> {
  const token = await request<{ access_token: string; refresh_token?: string }>(
    fetcher,
    'Google',
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    },
  );
  if (!token.refresh_token)
    throw new Error(
      'Google did not give a lasting sign-in. Remove the app at myaccount.google.com/permissions and sign in again.',
    );
  const profile = await request<{ emailAddress: string }>(fetcher, 'Gmail', `${GMAIL}/profile`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  return { refresh_token: token.refresh_token, address: profile.emailAddress };
}

/** Encodes a header value that may hold Arabic, as RFC 2047 asks. Line breaks are removed, so no header can be added. */
const encodeHeader = (value: string): string => {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
};

/** A plain-text email in the form Gmail's API takes: base64url of the whole message. */
export function buildMime(message: { from: string; to: string; subject: string; body: string }): string {
  const body = Buffer.from(message.body, 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');
  const mime = [
    `From: ${encodeHeader(message.from)}`,
    `To: ${encodeHeader(message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
}

export class GmailConnector extends LiveConnector {
  readonly id = 'gmail';
  private token: { value: string; expires: number } | null = null;

  constructor(
    private readonly creds: GmailCredentials,
    private readonly fetcher: Fetch,
  ) {
    super();
  }

  get address(): string {
    return this.creds.address;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const token = await request<{ access_token: string; expires_in: number }>(
      this.fetcher,
      'Google',
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.creds.client_id,
          client_secret: this.creds.client_secret,
          refresh_token: this.creds.refresh_token,
          grant_type: 'refresh_token',
        }),
      },
    );
    this.token = { value: token.access_token, expires: Date.now() + token.expires_in * 1000 };
    return token.access_token;
  }

  private async gmail<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' };
    return request<T>(this.fetcher, 'Gmail', `${GMAIL}${path}`, { ...init, headers });
  }

  protected async call(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const raw = buildMime({
      from: this.creds.address,
      to: String(payload.to),
      subject: String(payload.subject),
      body: String(payload.body),
    });
    if (actionType === 'gmail.create_draft') {
      const draft = await this.gmail<{ id: string }>('/drafts', {
        method: 'POST',
        body: JSON.stringify({ message: { raw } }),
      });
      return { draft_id: draft.id };
    }
    if (actionType === 'gmail.send_email') {
      const sent = await this.gmail<{ id: string; threadId: string }>('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw }),
      });
      return { message_id: sent.id, thread_id: sent.threadId };
    }
    throw unknownAction(this.id, actionType);
  }

  async health(): Promise<{ ok: boolean; note: string }> {
    try {
      const profile = await this.gmail<{ emailAddress: string }>('/profile');
      return { ok: true, note: `Connected to ${profile.emailAddress}.` };
    } catch (error) {
      return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
  }

  /** New mail in the inbox from the last week, not sent by the mailbox itself, newest first. */
  async listInbox(max = 20): Promise<string[]> {
    const list = await this.gmail<{ messages?: Array<{ id: string }> }>(
      `/messages?${new URLSearchParams({ q: 'in:inbox -from:me newer_than:7d', maxResults: String(max) })}`,
    );
    return (list.messages ?? []).map((m) => m.id);
  }

  async readMessage(id: string): Promise<GmailMessage> {
    const message = await this.gmail<GmailPayload>(`/messages/${encodeURIComponent(id)}?format=full`);
    const header = (name: string): string =>
      message.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
    return {
      id: message.id,
      from: addressOf(header('from')),
      subject: header('subject'),
      body: textOf(message.payload),
    };
  }
}

interface GmailPart {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailPayload {
  id: string;
  payload?: GmailPart;
}

/** The address inside a From header such as `Sara <sara@example.com>`. */
function addressOf(from: string): string {
  const inside = /<([^>]+)>/.exec(from);
  return (inside?.[1] ?? from).trim().toLowerCase();
}

/** The readable text of an email: the plain part if there is one, otherwise the HTML part without its tags. */
export function textOf(part: GmailPart | undefined): string {
  const plain = findPart(part, 'text/plain');
  if (plain) return plain.trim();
  const html = findPart(part, 'text/html');
  if (!html) return '';
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findPart(part: GmailPart | undefined, type: string): string | null {
  if (!part) return null;
  if (part.mimeType === type && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const child of part.parts ?? []) {
    const found = findPart(child, type);
    if (found) return found;
  }
  return null;
}
