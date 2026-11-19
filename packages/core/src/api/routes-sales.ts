import { z } from 'zod';
import {
  acceptProposal,
  createInvoice,
  createProposal,
  declineProposal,
  listInvoices,
  listProposals,
  markInvoicePaid,
  publicInvoice,
  publicProposal,
  sendInvoice,
  sendProposal,
  voidInvoice,
} from '../crm/billing';
import { listLeads } from '../crm/crm';
import { addProspects, changeLead, revenueStatus } from '../crm/pipeline';
import { createRule, listRules, revokeRule } from '../governance/rules';
import { getPolicy } from '../governance/settings';
import { forbidden, invalid } from '../lib/errors';
import type { Platform } from '../platform';
import { SALES_TEMPLATE_KEYS } from '../sales-templates';
import type { Caller, Router } from './http';

/** The revenue engine's addresses: the goal, the pipeline, prospects, proposals, invoices and Sales' autopilot. */

const staffOf = (caller: Caller) => {
  if (caller.kind !== 'staff') throw forbidden('This is for the team only.');
  return caller;
};

/** The standing rule that lets Sales send its template emails without asking each time. */
export const AUTOPILOT_RULE = 'Sales autopilot';

export function registerSalesRoutes(router: Router, platform: Platform): void {
  const { db, clock } = platform;

  const autopilot = async () =>
    (await listRules(db)).find((rule) => rule.name === AUTOPILOT_RULE && rule.status === 'active') ?? null;

  // ---------------------------------------------------------------- Public: what a client opens from an email

  router.add('GET', '/api/public/proposals/:token', 'public', async ({ params }) =>
    publicProposal(db, params.token!, clock()),
  );

  router.add('POST', '/api/public/proposals/:token/accept', 'public', async ({ params, json }) =>
    acceptProposal(db, params.token!, String(json.name ?? ''), clock()),
  );

  router.add('POST', '/api/public/proposals/:token/decline', 'public', async ({ params, json }) => {
    await declineProposal(db, params.token!, String(json.reason ?? ''), clock());
    return { declined: true };
  });

  router.add('GET', '/api/public/invoices/:token', 'public', async ({ params }) => publicInvoice(db, params.token!));

  // ---------------------------------------------------------------- The owner

  router.add('GET', '/api/owner/revenue', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { ...(await revenueStatus(db, clock())), autopilot: await autopilot() };
  });

  router.add('GET', '/api/owner/pipeline', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { leads: await listLeads(db), proposals: await listProposals(db), invoices: await listInvoices(db) };
  });

  router.add('POST', '/api/owner/prospects', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    return addProspects(db, json.prospects as unknown[], staff.actor, clock());
  });

  router.add('POST', '/api/owner/leads/:id', 'owner', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    return { lead: await changeLead(db, params.id!, json, staff.actor) };
  });

  router.add('POST', '/api/owner/proposals', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const { send, ...rest } = json;
    const proposal = await createProposal(db, rest, staff.actor, clock());
    if (send === true) await sendProposal(db, proposal.id, staff.actor);
    return { proposal };
  });

  router.add('POST', '/api/owner/proposals/:id/send', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    await sendProposal(db, params.id!, staff.actor);
    return { sending: true };
  });

  router.add('POST', '/api/owner/invoices', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const { send, ...rest } = json;
    const invoice = await createInvoice(db, rest, staff.actor, clock());
    if (send === true && invoice.status === 'draft') await sendInvoice(db, invoice.id, staff.actor);
    return { invoice };
  });

  router.add('POST', '/api/owner/invoices/:id/send', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    await sendInvoice(db, params.id!, staff.actor);
    return { sending: true };
  });

  router.add('POST', '/api/owner/invoices/:id/paid', 'owner', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    const via = z.enum(['bank', 'cliq', 'paypal', 'gumroad', 'cash', 'other']).safeParse(json.via ?? 'bank');
    if (!via.success) throw invalid('say how it was paid: bank, cliq, paypal, gumroad, cash or other');
    return { invoice: await markInvoicePaid(db, params.id!, via.data, staff.actor, clock()) };
  });

  router.add('POST', '/api/owner/invoices/:id/void', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    return { invoice: await voidInvoice(db, params.id!, staff.actor) };
  });

  // Sales' autopilot: one standing rule for its own template emails, renewed by turning it on again.
  router.add('POST', '/api/owner/sales/autopilot', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const current = await autopilot();
    if (current) await revokeRule(db, current.id, staff.actor, staff.isOwner);
    if (json.on !== true) return { autopilot: null };
    const now = clock();
    const days = await getPolicy(db, 'rules.max_lifetime_days');
    const rule = await createRule(
      db,
      {
        name: AUTOPILOT_RULE,
        actionType: 'gmail.send_email',
        conditions: { templates: SALES_TEMPLATE_KEYS },
        spendLimitPerActionMinor: 0,
        spendLimitPerPeriodMinor: 0,
        recipientLimitPerPeriod: await getPolicy(db, 'sales.daily_send_limit'),
        period: 'day',
        expiresAt: new Date(now.getTime() + days * 86_400_000),
      },
      staff.actor,
      staff.isOwner,
      now,
    );
    return { autopilot: rule };
  });
}
