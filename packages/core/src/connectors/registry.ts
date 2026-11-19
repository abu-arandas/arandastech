import type { Db } from '../lib/db';
import { AppError, invalid } from '../lib/errors';
import { sha256 } from '../lib/hash';
import { recordInbound } from '../crm/crm';
import {
  CONNECTIONS,
  type ConnectionSpec,
  checkTyped,
  clearConnection,
  connectionSpec,
  describe,
  isComplete,
  notConnected,
  randomToken,
  readConnection,
  writeConnection,
} from './connections';
import type { Fetch } from './live/base';
import { BufferConnector, findBufferChannels } from './live/buffer';
import { GitHubConnector } from './live/github';
import { exchangeGoogleCode, GmailConnector, googleSignInUrl } from './live/gmail';
import { PayTabsConnector, paytabsEvent } from './live/paytabs';
import { findVercelTeam, VercelConnector } from './live/vercel';
import { WhatsAppConnector, whatsappMessages, whatsappSignatureOk } from './live/whatsapp';
import type { MockConnector } from './mock';
import type { Connector } from './types';

/** What the registry needs from the platform: the database, the connectors the gateway uses, and the mocks to fall back to. */
export interface ConnectorHost {
  db: Db;
  connectors: Record<string, Connector>;
  mocks: Record<string, MockConnector>;
  fetch: Fetch;
  /** Handles a payment notice whose signature an adapter checked. */
  paymentEvent(event: {
    id: string;
    type: string;
    data: Record<string, unknown>;
  }): Promise<{ duplicate: boolean; result: string }>;
}

function build(spec: ConnectionSpec, v: Record<string, string>, fetcher: Fetch): Connector {
  switch (spec.id) {
    case 'gmail':
      return new GmailConnector(
        {
          client_id: v.client_id!,
          client_secret: v.client_secret!,
          refresh_token: v.refresh_token!,
          address: v.address!,
        },
        fetcher,
      );
    case 'github':
      return new GitHubConnector(v.token!, fetcher);
    case 'vercel':
      return new VercelConnector({ token: v.token!, team_id: v.team_id! }, fetcher);
    case 'buffer':
      return new BufferConnector(
        { api_key: v.api_key!, channels: JSON.parse(v.channels || '{}') as Record<string, string> },
        fetcher,
      );
    case 'whatsapp':
      return new WhatsAppConnector(
        {
          phone_number_id: v.phone_number_id!,
          access_token: v.access_token!,
          app_secret: v.app_secret!,
          verify_token: v.verify_token!,
        },
        fetcher,
      );
    case 'payments':
      return new PayTabsConnector({ profile_id: v.profile_id!, server_key: v.server_key!, region: v.region }, fetcher);
    default:
      throw new Error(`no live connector for ${spec.id}`);
  }
}

/**
 * Puts each connector in the mode its saved values allow: live when every value is saved, the mock otherwise.
 * The gateway holds the same map, so the change applies to the next action at once.
 */
export async function refreshConnectors(host: ConnectorHost): Promise<void> {
  const [table] = await host.db.query<{ present: boolean }>(`select to_regclass('ops.secrets') is not null as present`);
  for (const spec of CONNECTIONS) {
    const values = table?.present ? await readConnection(host.db, spec.id) : {};
    const live = isComplete(spec, values);
    const mock = host.mocks[spec.id];
    if (live && !spec.inbound) host.connectors[spec.id] = build(spec, values, host.fetch);
    else if (mock) host.connectors[spec.id] = mock;
    await host.db.query(
      `update connectors set mode = $2, status = case when $2 = 'live' then 'live' when status = 'live' then 'built' else status end where id = $1 and mode is distinct from $2`,
      [spec.id, live ? 'live' : 'mock'],
    );
  }
}

/** Each connection with what is saved (never the secrets), its steps and whether it is live. */
export async function listConnections(host: ConnectorHost, urls: { site: string }) {
  const rows = await host.db.query<{
    id: string;
    name: string;
    mode: string;
    status: string;
    status_note: string;
    last_ok_at: Date | null;
    last_error: string | null;
  }>('select id, name, mode, status, status_note, last_ok_at, last_error from connectors');
  const out = [];
  for (const spec of CONNECTIONS) {
    const row = rows.find((r) => r.id === spec.id);
    const values = await readConnection(host.db, spec.id);
    out.push({
      id: spec.id,
      name: row?.name ?? spec.id,
      mode: row?.mode ?? 'mock',
      last_ok_at: row?.last_ok_at ?? null,
      last_error: row?.last_error ?? null,
      sign_in: spec.signIn ?? null,
      steps: spec.steps,
      fields: describe(spec, values),
      addresses: addressesFor(spec.id, urls.site, values),
    });
  }
  return out;
}

/** The addresses the owner copies into the provider's settings. */
function addressesFor(
  id: string,
  site: string,
  values: Record<string, string>,
): Array<{ label: string; value: string }> {
  if (id === 'gmail') return [{ label: 'Authorized redirect URI', value: `${site}/api/connect/gmail/callback` }];
  if (id === 'whatsapp')
    return [
      { label: 'Callback URL', value: `${site}/api/webhooks/whatsapp` },
      ...(values.verify_token ? [{ label: 'Verify token', value: values.verify_token }] : []),
    ];
  if (id === 'payments') return [{ label: 'Callback (IPN) URL', value: `${site}/api/webhooks/paytabs` }];
  if (id === 'gumroad' && values.ping_key)
    return [{ label: 'Ping address', value: `${site}/api/webhooks/gumroad/${values.ping_key}` }];
  return [];
}

/**
 * Saves what the owner typed, fills in what can be found from it (the Vercel team, the Buffer channels, the WhatsApp
 * verify token), switches the connector live when it is complete, and checks it at once.
 */
export async function saveConnection(
  host: ConnectorHost,
  id: string,
  raw: unknown,
): Promise<{ mode: string; health: { ok: boolean; note: string } | null }> {
  const spec = connectionSpec(id);
  if (!spec) throw new AppError('not_found', 'There is no such connection.', 404);
  const typed = checkTyped(spec, raw);
  if (!Object.keys(typed).length) throw invalid('Type at least one value.');
  const found: Record<string, string | null> = {};
  if (id === 'vercel' && typed.token) found.team_id = await findVercelTeam(host.fetch, typed.token);
  if (id === 'buffer' && typed.api_key)
    found.channels = JSON.stringify(await findBufferChannels(host.fetch, typed.api_key));
  if (id === 'whatsapp' && !(await readConnection(host.db, id)).verify_token) found.verify_token = randomToken();
  if (id === 'gumroad' && !(await readConnection(host.db, id)).ping_key) found.ping_key = randomToken();
  // A new Google client means the old sign-in no longer matches it.
  if (id === 'gmail' && (typed.client_id || typed.client_secret))
    Object.assign(found, { refresh_token: null, address: null });
  await writeConnection(host.db, id, { ...typed, ...found });
  return check(host, id);
}

export async function disconnect(host: ConnectorHost, id: string): Promise<void> {
  if (!connectionSpec(id)) throw new AppError('not_found', 'There is no such connection.', 404);
  await clearConnection(host.db, id);
  await host.db.query(`update connectors set last_error = null where id = $1`, [id]);
  await refreshConnectors(host);
}

/** Switches the connector to what is saved and asks the provider whether it answers. */
export async function check(
  host: ConnectorHost,
  id: string,
): Promise<{ mode: string; health: { ok: boolean; note: string } | null }> {
  await refreshConnectors(host);
  if (connectionSpec(id)?.inbound) {
    const [row] = await host.db.query<{ mode: string }>('select mode from connectors where id = $1', [id]);
    return { mode: row?.mode ?? 'mock', health: null };
  }
  const connector = host.connectors[id];
  if (!connector || connector.mode !== 'live') return { mode: 'mock', health: null };
  const health = await connector.health();
  await host.db.query(
    health.ok
      ? `update connectors set last_ok_at = now(), last_error = null, status_note = $2 where id = $1`
      : `update connectors set last_error = $2 where id = $1`,
    [id, health.note],
  );
  return { mode: 'live', health };
}

// ---------------------------------------------------------------- Google sign-in

const STATE_TTL_MS = 15 * 60_000;

/** Starts Google's sign-in. The state is kept as a hash and lasts 15 minutes, so a link cannot be replayed later. */
export async function startGoogleSignIn(host: ConnectorHost, redirectUri: string): Promise<{ url: string }> {
  const values = await readConnection(host.db, 'gmail');
  if (!values.client_id || !values.client_secret) throw invalid('Save the client ID and client secret first.');
  const state = randomToken();
  await writeConnection(host.db, 'gmail', { oauth_state: `${sha256(state)}:${Date.now() + STATE_TTL_MS}` });
  return { url: googleSignInUrl(values.client_id, redirectUri, state) };
}

/** Finishes Google's sign-in: checks the state, keeps the refresh token, and switches Gmail live. */
export async function finishGoogleSignIn(
  host: ConnectorHost,
  input: { code: string; state: string; redirectUri: string },
): Promise<{ address: string }> {
  const values = await readConnection(host.db, 'gmail');
  const [hash, expires] = (values.oauth_state ?? '').split(':');
  await writeConnection(host.db, 'gmail', { oauth_state: null });
  if (!hash || sha256(input.state) !== hash || Number(expires) < Date.now())
    throw new AppError('bad_state', 'This sign-in link has expired. Press Sign in with Google again.', 400);
  if (!values.client_id || !values.client_secret) throw invalid('Save the client ID and client secret first.');
  const signedIn = await exchangeGoogleCode(
    host.fetch,
    { client_id: values.client_id, client_secret: values.client_secret },
    input.code,
    input.redirectUri,
  );
  await writeConnection(host.db, 'gmail', signedIn);
  await check(host, 'gmail');
  return { address: signedIn.address };
}

// ---------------------------------------------------------------- Inboxes

const SYNC_GAP_MS = 60_000;
const locale = (text: string): 'en' | 'ar' => (/[؀-ۿ]/.test(text) ? 'ar' : 'en');

/**
 * Reads new mail from the Gmail inbox into the platform, where Support answers it. At most once a minute unless forced.
 * Each email is recorded once, by its Gmail id.
 */
export async function syncGmail(
  host: ConnectorHost,
  options: { force?: boolean } = {},
): Promise<{ read: number; skipped?: string }> {
  const gmail = host.connectors.gmail;
  if (!(gmail instanceof GmailConnector)) return { read: 0, skipped: 'Gmail is not connected.' };
  if (!options.force) {
    const [last] = await host.db.query<{ synced_at: Date }>(
      `select synced_at from connector_sync where connector = 'gmail'`,
    );
    if (last && Date.now() - new Date(last.synced_at).getTime() < SYNC_GAP_MS)
      return { read: 0, skipped: 'Read less than a minute ago.' };
  }
  await host.db.query(
    `insert into connector_sync (connector, synced_at) values ('gmail', now()) on conflict (connector) do update set synced_at = now()`,
  );
  let read = 0;
  try {
    for (const id of await gmail.listInbox()) {
      const known = await host.db.query(`select 1 from messages where channel = 'email' and external_id = $1`, [id]);
      if (known.length) continue;
      const mail = await gmail.readMessage(id);
      if (!mail.from || mail.from === gmail.address.toLowerCase()) continue;
      await recordInbound(host.db, {
        channel: 'email',
        from: mail.from,
        subject: mail.subject.slice(0, 200) || undefined,
        body: (mail.body || '(no text)').slice(0, 10_000),
        locale: locale(`${mail.subject} ${mail.body}`),
        externalId: id,
      }).catch((error: unknown) => {
        // Another reader recorded it a moment earlier.
        if (!String(error).includes('messages_channel_external_id')) throw error;
      });
      read += 1;
    }
    await host.db.query(`update connector_sync set note = $1 where connector = 'gmail'`, [`${read} new`]);
    await host.db.query(`update connectors set last_ok_at = now(), last_error = null where id = 'gmail'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await host.db.query(`update connectors set last_error = $1 where id = 'gmail'`, [message]);
    throw error;
  }
  return { read };
}

/** Meta's check when the webhook is set up: echo the challenge only for the saved verify token. */
export async function whatsappVerify(host: ConnectorHost, query: Record<string, string>): Promise<string> {
  const values = await readConnection(host.db, 'whatsapp');
  if (query['hub.mode'] !== 'subscribe' || !values.verify_token || query['hub.verify_token'] !== values.verify_token)
    throw new AppError('forbidden', 'The verify token does not match.', 403);
  return query['hub.challenge'] ?? '';
}

/** Incoming WhatsApp messages. The signature is checked first, and each message is recorded once. */
export async function whatsappWebhook(
  host: ConnectorHost,
  rawBody: string,
  signature: string | undefined,
): Promise<{ read: number }> {
  const values = await readConnection(host.db, 'whatsapp');
  if (!values.app_secret) throw notConnected('WhatsApp');
  if (!whatsappSignatureOk(values.app_secret, rawBody, signature))
    throw new AppError('bad_signature', 'The signature of this notice is not valid.', 401);
  let read = 0;
  for (const message of whatsappMessages(JSON.parse(rawBody))) {
    const known = await host.db.query(`select 1 from messages where channel = 'whatsapp' and external_id = $1`, [
      message.id,
    ]);
    if (known.length) continue;
    await recordInbound(host.db, {
      channel: 'whatsapp',
      from: message.from,
      body: message.text.slice(0, 5000),
      locale: locale(message.text),
      externalId: message.id,
    });
    read += 1;
  }
  return { read };
}

/** PayTabs' callback. The signature is checked with the server key, then it becomes the store's payment notice. */
export async function paytabsCallback(host: ConnectorHost, rawBody: string, signature: string | undefined) {
  const payments = host.connectors.payments;
  if (!(payments instanceof PayTabsConnector)) throw notConnected('PayTabs');
  if (!payments.signatureOk(rawBody, signature))
    throw new AppError('bad_signature', 'The signature of this notice is not valid.', 401);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw invalid('The notice is not in the expected form.');
  }
  const event = paytabsEvent(body);
  if (!event) throw invalid('The notice is not in the expected form.');
  return host.paymentEvent(event);
}

/** The live card provider, when PayTabs is connected. */
export const livePayments = (host: ConnectorHost): PayTabsConnector | null =>
  host.connectors.payments instanceof PayTabsConnector ? host.connectors.payments : null;
