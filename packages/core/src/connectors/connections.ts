import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../lib/db';
import { AppError, invalid } from '../lib/errors';

/** One value an outside account needs. Secret values are written once and never shown again, not even to the owner. */
interface ConnectionField {
  key: string;
  label: string;
  secret: boolean;
  /** Where the owner finds the value, in plain words. */
  help: string;
  /** A value the platform fills in itself, such as the Gmail address after Google's sign-in. The owner never types it. */
  automatic?: boolean;
  optional?: boolean;
  pattern?: RegExp;
}

export interface ConnectionSpec {
  id: string;
  fields: ConnectionField[];
  /** Signs in on the provider's own page instead of a pasted key. */
  signIn?: 'google';
  /** What the owner does, step by step, to get the values. */
  steps: string[];
}

export const CONNECTIONS: ConnectionSpec[] = [
  {
    id: 'gmail',
    signIn: 'google',
    steps: [
      'In Google Cloud (console.cloud.google.com), make a project and turn on the Gmail API.',
      'Under Google Auth Platform, fill in the app name and your email, choose External, and press Publish app so the sign-in does not expire after 7 days.',
      'Under Clients, make an OAuth client of type Web application, with the redirect address shown below.',
      'Paste the client ID and client secret here, press Save, then press Sign in with Google.',
    ],
    fields: [
      {
        key: 'client_id',
        label: 'OAuth client ID',
        secret: false,
        help: 'Ends in .apps.googleusercontent.com',
        pattern: /^[\w.-]+\.apps\.googleusercontent\.com$/,
      },
      { key: 'client_secret', label: 'OAuth client secret', secret: true, help: 'Starts with GOCSPX-' },
      {
        key: 'refresh_token',
        label: 'Google sign-in',
        secret: true,
        automatic: true,
        help: 'Filled in by Sign in with Google.',
      },
      {
        key: 'address',
        label: 'Mailbox',
        secret: false,
        automatic: true,
        help: 'The Gmail address you signed in with.',
      },
    ],
  },
  {
    id: 'github',
    steps: [
      'On GitHub, open Settings, Developer settings, Fine-grained tokens, and generate a new token.',
      'Give it access to your repositories with Issues and Pull requests set to Read and write, and Contents set to Read and write.',
      'Paste the token here and press Save.',
    ],
    fields: [{ key: 'token', label: 'Fine-grained token', secret: true, help: 'Starts with github_pat_' }],
  },
  {
    id: 'vercel',
    steps: [
      'On Vercel, open Account Settings, Tokens, and create a token limited to your team.',
      'Paste the token here and press Save. The team is found by itself.',
    ],
    fields: [
      { key: 'token', label: 'Access token', secret: true, help: 'From vercel.com/account/settings/tokens' },
      { key: 'team_id', label: 'Team', secret: false, automatic: true, help: 'Found from the token.' },
    ],
  },
  {
    id: 'buffer',
    steps: [
      'On Buffer, open Settings, API, and make a personal API key.',
      'Paste the key here and press Save. Your Facebook and LinkedIn channels are found by themselves.',
    ],
    fields: [
      { key: 'api_key', label: 'API key', secret: true, help: 'From publish.buffer.com/settings/api' },
      { key: 'channels', label: 'Channels', secret: false, automatic: true, help: 'Found from the key.' },
    ],
  },
  {
    id: 'whatsapp',
    steps: [
      'On developers.facebook.com, make a Business app and add the WhatsApp product. Add your business phone number.',
      'Make a permanent access token for a system user in Meta Business Settings, with whatsapp_business_messaging.',
      'Paste the phone number ID, the token and the app secret (App settings, Basic) here and press Save.',
      'In the app, under WhatsApp, Configuration, set the webhook address and verify token shown below, and subscribe to messages.',
    ],
    fields: [
      {
        key: 'phone_number_id',
        label: 'Phone number ID',
        secret: false,
        help: 'WhatsApp, API Setup',
        pattern: /^\d{6,30}$/,
      },
      { key: 'access_token', label: 'Permanent access token', secret: true, help: 'A system user token' },
      { key: 'app_secret', label: 'App secret', secret: true, help: 'App settings, Basic' },
      {
        key: 'verify_token',
        label: 'Webhook verify token',
        secret: false,
        automatic: true,
        help: 'Made by the platform.',
      },
    ],
  },
  {
    id: 'payments',
    steps: [
      'In the PayTabs merchant dashboard, open Developers, Key management, and copy the profile ID and the server key.',
      'Paste them here and press Save. Test keys take test cards; live keys come after PayTabs approves your account.',
    ],
    fields: [
      {
        key: 'profile_id',
        label: 'Profile ID',
        secret: false,
        help: 'A number, such as 188161',
        pattern: /^\d{3,12}$/,
      },
      { key: 'server_key', label: 'Server key', secret: true, help: 'Developers, Key management' },
      {
        key: 'region',
        label: 'Region',
        secret: false,
        optional: true,
        help: 'jor for Jordan (the default), are, sau, egy, omn or global',
        pattern: /^(jor|are|sau|egy|omn|global)$/,
      },
    ],
  },
];

export const connectionSpec = (id: string): ConnectionSpec | null => CONNECTIONS.find((c) => c.id === id) ?? null;

const secretName = (connector: string, key: string): string => `connector:${connector}:${key}`;

/** The saved values of one connection, secret ones included. Only the server reads these. */
export async function readConnection(db: Db, connector: string): Promise<Record<string, string>> {
  // A database never deployed with db:deploy (a local one) has no ops.secrets, so nothing is connected there.
  const [table] = await db.query<{ present: boolean }>(`select to_regclass('ops.secrets') is not null as present`);
  if (!table?.present) return {};
  const rows = await db.query<{ name: string; value: string }>(
    `select name, value from ops.secrets where starts_with(name, $1)`,
    [`connector:${connector}:`],
  );
  return Object.fromEntries(rows.map((row) => [row.name.slice(`connector:${connector}:`.length), row.value]));
}

/** Stores values for a connection. An empty value removes that field. */
export async function writeConnection(db: Db, connector: string, values: Record<string, string | null>): Promise<void> {
  await db.query(`create schema if not exists ops`);
  await db.query(
    `create table if not exists ops.secrets (name text primary key, value text not null, created_at timestamptz not null default now())`,
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === '')
      await db.query(`delete from ops.secrets where name = $1`, [secretName(connector, key)]);
    else
      await db.query(
        `insert into ops.secrets (name, value) values ($1, $2) on conflict (name) do update set value = excluded.value, created_at = now()`,
        [secretName(connector, key), value],
      );
  }
}

export async function clearConnection(db: Db, connector: string): Promise<void> {
  await db.query(`delete from ops.secrets where starts_with(name, $1)`, [`connector:${connector}:`]);
}

/** The values the owner typed, checked against the connection's fields. Automatic fields cannot be typed. */
export function checkTyped(spec: ConnectionSpec, raw: unknown): Record<string, string> {
  const parsed = z.record(z.string(), z.string().max(4000)).safeParse(raw);
  if (!parsed.success) throw invalid('Send each value as text.');
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(parsed.data)) {
    const field = spec.fields.find((f) => f.key === key && !f.automatic);
    if (!field) throw invalid(`${key} is not a value this connection takes.`);
    const value = rawValue.trim();
    if (!value) continue;
    if (/\s/.test(value)) throw invalid(`${field.label} has a space in it. Copy it again without spaces.`);
    if (field.pattern && !field.pattern.test(value))
      throw invalid(`${field.label} does not look right: ${field.help}.`);
    out[key] = value;
  }
  return out;
}

/** Whether every value a connection needs is saved. */
export const isComplete = (spec: ConnectionSpec, values: Record<string, string>): boolean =>
  spec.fields.every((f) => f.optional || Boolean(values[f.key]));

/** What the owner app shows: which values are saved, and the non-secret ones themselves. Secrets never leave the server. */
export function describe(spec: ConnectionSpec, values: Record<string, string>) {
  return spec.fields.map((f) => ({
    key: f.key,
    label: f.label,
    help: f.help,
    secret: f.secret,
    automatic: Boolean(f.automatic),
    optional: Boolean(f.optional),
    set: Boolean(values[f.key]),
    value: f.secret ? null : (values[f.key] ?? null),
  }));
}

/** A short random value for webhook verification and sign-in state. */
export const randomToken = (): string => randomBytes(24).toString('base64url');

export const notConnected = (name: string): AppError =>
  new AppError('not_connected', `${name} is not connected. Connect it in the owner app first.`, 409);
