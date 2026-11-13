import { z } from 'zod';
import { formatMoney } from '../lib/money';
import type { Level } from '../lib/types';
import type { PauseTarget } from './pause';

/** Whether a standing rule may ever cover an action (blueprint 2.3). */
export type Delegable = 'not_needed' | 'yes' | 'later' | 'never';

/** One named, typed operation that can leave the platform. The level belongs to the action, not to whoever asks for it. */
export interface ActionSpec<P = Record<string, unknown>> {
  type: string;
  connector: string;
  level: Level | ((payload: P) => Level);
  schema: z.ZodType<P>;
  /** The action in plain words, for the approval inbox. */
  summarize: (payload: P) => string;
  recipient?: (payload: P) => string | null;
  cost?: (payload: P) => { amount: number; currency: string } | null;
  reversible: boolean;
  risk: string;
  expected: (payload: P) => string;
  delegable: Delegable;
  /** Pauses this action respects besides the global one and its connector's. */
  pauseScopes?: (payload: P) => PauseTarget[];
}

const locale = z.enum(['en', 'ar']);
const money = z.strictObject({ amount_minor: z.number().int().positive(), currency: z.string().regex(/^[A-Z]{3}$/) });

const email = z.strictObject({
  to: z.email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  locale,
  template: z.string().max(80).optional(),
  lead_id: z.uuid().optional(),
  order_id: z.uuid().optional(),
});

const chat = z.strictObject({
  to: z.string().min(5).max(40),
  body: z.string().min(1).max(4000),
  locale,
  template: z.string().max(80).optional(),
  lead_id: z.uuid().optional(),
  order_id: z.uuid().optional(),
});

const post = z.strictObject({
  channel: z.enum(['facebook', 'linkedin']),
  text: z.string().min(1).max(3000),
  locale,
  link: z.url().optional(),
  scheduled_for: z.iso.datetime().optional(),
});

const issue = z.strictObject({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  title: z.string().min(1).max(200),
  body: z.string().max(20_000),
  /** An issue in a public repository can be read by outsiders, so it is a Level 2 action. */
  public: z.boolean(),
});

function define<P>(spec: ActionSpec<P>): ActionSpec<P> {
  return spec;
}

export const ACTION_SPECS = [
  define({
    type: 'gmail.create_draft',
    connector: 'gmail',
    level: 1,
    schema: email,
    summarize: (p) => `Save a draft email to ${p.to}: "${p.subject}"`,
    recipient: (p) => p.to,
    reversible: true,
    risk: 'None. A draft stays inside the company.',
    expected: () => 'A draft appears in the mailbox for a person to review.',
    delegable: 'not_needed',
  }),
  define({
    type: 'gmail.send_email',
    connector: 'gmail',
    level: 2,
    schema: email,
    summarize: (p) => `Send an email to ${p.to}: "${p.subject}"`,
    recipient: (p) => p.to,
    reversible: false,
    risk: 'An email cannot be recalled once it is sent.',
    expected: (p) => `${p.to} receives the email exactly as shown.`,
    delegable: 'yes',
  }),
  define({
    type: 'whatsapp.send_message',
    connector: 'whatsapp',
    level: 2,
    schema: chat,
    summarize: (p) => `Send a WhatsApp message to ${p.to}`,
    recipient: (p) => p.to,
    reversible: false,
    risk: 'A message cannot be recalled once it is delivered. Meta charges per delivered message.',
    expected: (p) => `${p.to} receives the message exactly as shown.`,
    delegable: 'yes',
  }),
  define({
    type: 'buffer.create_draft',
    connector: 'buffer',
    level: 1,
    schema: post,
    summarize: (p) => `Save a ${p.channel} post as a draft`,
    reversible: true,
    risk: 'None. A draft is not published.',
    expected: () => 'The draft appears in Buffer for review.',
    delegable: 'not_needed',
  }),
  define({
    type: 'buffer.schedule_post',
    connector: 'buffer',
    level: 2,
    schema: post,
    summarize: (p) => `Publish a ${p.channel} post${p.scheduled_for ? ` on ${p.scheduled_for}` : ''}`,
    recipient: (p) => `${p.channel} audience`,
    reversible: true,
    risk: 'The post is public. It can be deleted afterwards, but people may already have seen it.',
    expected: (p) => `The post appears on the company's ${p.channel} page.`,
    delegable: 'yes',
  }),
  define({
    type: 'github.create_issue',
    connector: 'github',
    level: (p) => (p.public ? 2 : 1),
    schema: issue,
    summarize: (p) => `Create an issue in ${p.repository}: "${p.title}"`,
    reversible: true,
    risk: 'In a public repository the issue can be read by anyone.',
    expected: (p) => `A new issue exists in ${p.repository}.`,
    delegable: 'yes',
  }),
  define({
    type: 'github.merge_pull_request',
    connector: 'github',
    level: 2,
    schema: z.strictObject({ repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/), number: z.number().int().positive(), title: z.string().max(200) }),
    summarize: (p) => `Merge pull request #${p.number} in ${p.repository}: "${p.title}"`,
    reversible: true,
    risk: 'The change reaches the protected branch. It can be reverted with another commit.',
    expected: (p) => `Pull request #${p.number} is merged.`,
    delegable: 'yes',
  }),
  define({
    type: 'vercel.create_preview',
    connector: 'vercel',
    level: 1,
    schema: z.strictObject({ project: z.string().min(1).max(100), ref: z.string().min(1).max(200) }),
    summarize: (p) => `Create a preview deployment of ${p.project} at ${p.ref}`,
    reversible: true,
    risk: 'None. A preview is not the production site.',
    expected: (p) => `A preview address exists for ${p.project}.`,
    delegable: 'not_needed',
  }),
  define({
    type: 'vercel.deploy_production',
    connector: 'vercel',
    level: 2,
    schema: z.strictObject({ project: z.string().min(1).max(100), ref: z.string().min(1).max(200) }),
    summarize: (p) => `Deploy ${p.project} to production from ${p.ref}`,
    reversible: true,
    risk: 'Customers see the new version at once. A rollback restores the previous one.',
    expected: (p) => `${p.project} serves ${p.ref} in production.`,
    delegable: 'later',
  }),
  define({
    type: 'store.publish_product',
    connector: 'platform',
    level: 2,
    schema: z.strictObject({ product_id: z.uuid(), override_reason: z.string().min(10).max(500).optional() }),
    summarize: () => 'Publish a product in the store',
    reversible: true,
    risk: 'The product becomes visible and can be bought. It can be paused at once.',
    expected: () => 'The product page is live and the product can be ordered.',
    delegable: 'never',
    pauseScopes: (p) => [{ scope: 'product', target: p.product_id }],
  }),
  define({
    type: 'payments.send_invoice',
    connector: 'payments',
    level: 2,
    schema: z.strictObject({ ...money.shape, to: z.email(), description: z.string().min(1).max(500), package_id: z.string().max(80).optional() }),
    summarize: (p) => `Send an invoice for ${formatMoney(p.amount_minor, p.currency)} to ${p.to}`,
    recipient: (p) => p.to,
    reversible: true,
    risk: 'The customer receives a request for payment. It can be cancelled before it is paid.',
    expected: (p) => `${p.to} receives an invoice for ${formatMoney(p.amount_minor, p.currency)}.`,
    delegable: 'yes',
  }),
  define({
    type: 'payments.refund',
    connector: 'payments',
    level: 3,
    schema: z.strictObject({ ...money.shape, refund_id: z.uuid(), order_id: z.uuid(), payment_ref: z.string().min(1), to: z.email(), reason: z.string().min(3).max(500) }),
    summarize: (p) => `Refund ${formatMoney(p.amount_minor, p.currency)} to ${p.to}`,
    recipient: (p) => p.to,
    cost: (p) => ({ amount: p.amount_minor, currency: p.currency }),
    reversible: false,
    risk: 'Money leaves the company and cannot be taken back.',
    expected: (p) => `${p.to} receives ${formatMoney(p.amount_minor, p.currency)} and the order is marked refunded.`,
    delegable: 'later',
  }),
  define({
    type: 'supplier.place_order',
    connector: 'supplier',
    level: 3,
    schema: z.strictObject({ ...money.shape, shipment_id: z.uuid(), order_id: z.uuid(), supplier_id: z.uuid(), supplier_name: z.string().min(1), items: z.array(z.strictObject({ sku: z.string(), quantity: z.number().int().positive() })).min(1), ship_to: z.string().min(1).max(500) }),
    summarize: (p) => `Order from ${p.supplier_name} for ${formatMoney(p.amount_minor, p.currency)}`,
    recipient: (p) => p.supplier_name,
    cost: (p) => ({ amount: p.amount_minor, currency: p.currency }),
    reversible: false,
    risk: 'The company commits to pay the supplier. Cancelling depends on the supplier.',
    expected: (p) => `${p.supplier_name} accepts the order and ships to the customer.`,
    delegable: 'later',
    pauseScopes: (p) => [{ scope: 'fulfillment' }, { scope: 'supplier', target: p.supplier_id }],
  }),
  define({
    type: 'data.delete',
    connector: 'platform',
    level: 3,
    schema: z.strictObject({ record_type: z.string().min(1).max(60), record_id: z.string().min(1).max(100), reason: z.string().min(10).max(500) }),
    summarize: (p) => `Delete ${p.record_type} ${p.record_id}`,
    reversible: false,
    risk: 'Deleted data cannot be restored except from a backup.',
    expected: (p) => `${p.record_type} ${p.record_id} no longer exists.`,
    delegable: 'never',
  }),
] as const;

const registry = new Map<string, ActionSpec<never>>(ACTION_SPECS.map((spec) => [spec.type, spec as unknown as ActionSpec<never>]));

export function actionSpec(type: string): ActionSpec<Record<string, unknown>> | null {
  return (registry.get(type) as unknown as ActionSpec<Record<string, unknown>> | undefined) ?? null;
}

export function levelOf(spec: ActionSpec<Record<string, unknown>>, payload: Record<string, unknown>): Level {
  return typeof spec.level === 'function' ? spec.level(payload) : spec.level;
}

/** The connectors the platform knows, with the status each one starts in. Live accounts are connected by the owner. */
export const CONNECTORS = [
  { id: 'platform', name: 'Zirr platform', status: 'live', note: 'Internal actions, such as publishing a product.' },
  { id: 'gmail', name: 'Gmail', status: 'built', note: 'Mock only. Needs a company mailbox and Google authorization.' },
  { id: 'whatsapp', name: 'WhatsApp', status: 'built', note: 'Mock only. Needs a WhatsApp Business Platform number.' },
  { id: 'buffer', name: 'Buffer', status: 'built', note: 'Mock only. Needs the owner to connect a Buffer account.' },
  { id: 'github', name: 'GitHub', status: 'built', note: 'Mock only. Needs a GitHub App installed on the repositories.' },
  { id: 'vercel', name: 'Vercel', status: 'built', note: 'Mock only. Needs an access token limited to the team.' },
  { id: 'payments', name: 'Payments', status: 'built', note: 'Mock provider. Needs a live provider that can receive and withdraw in Jordan.' },
  { id: 'supplier', name: 'Suppliers', status: 'built', note: 'Mock supplier. Needed only for physical products.' },
  { id: 'facebook', name: 'Facebook and Meta', status: 'planned', note: 'Publishing goes through Buffer first.' },
  { id: 'linkedin', name: 'LinkedIn', status: 'planned', note: 'Publishing goes through Buffer first.' },
] as const;
