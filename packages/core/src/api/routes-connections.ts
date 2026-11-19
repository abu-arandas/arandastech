import { z } from 'zod';
import {
  check as checkConnection,
  disconnect,
  listConnections,
  saveConnection,
  startGoogleSignIn,
  syncGmail,
} from '../connectors/registry';
import { audit } from '../governance/audit';
import type { Platform } from '../platform';
import { check, staffOf } from './guards';
import type { Router } from './http';

/** Connections to the owner's outside accounts. Keys are written once and never read back. */
export function registerConnectionRoutes(router: Router, platform: Platform): void {
  const { db } = platform;

  const site = (): string => platform.config.siteUrl ?? 'http://localhost:3000';
  const connectionId = z.enum(['gmail', 'github', 'vercel', 'buffer', 'whatsapp', 'payments']);

  router.add('GET', '/api/owner/connections', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { connections: await listConnections(platform, { site: site() }) };
  });

  // Keys are written once and never read back: the answer says only whether the account now answers.
  router.add('PUT', '/api/owner/connections/:id', 'owner', async ({ caller, params, json }) => {
    const staff = staffOf(caller);
    const id = check(connectionId, params.id);
    const result = await saveConnection(platform, id, json.values);
    await audit(db, {
      actor: staff.actor,
      type: 'connection.saved',
      subject: { type: 'connector', id },
      data: {
        fields: Object.keys((json.values as Record<string, unknown>) ?? {}),
        mode: result.mode,
        ok: result.health?.ok ?? null,
      },
    });
    return result;
  });

  router.add('POST', '/api/owner/connections/:id/check', 'owner', async ({ caller, params }) => {
    staffOf(caller);
    return checkConnection(platform, check(connectionId, params.id));
  });

  router.add('POST', '/api/owner/connections/:id/disconnect', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    const id = check(connectionId, params.id);
    await disconnect(platform, id);
    await audit(db, { actor: staff.actor, type: 'connection.removed', subject: { type: 'connector', id }, data: {} });
    return { mode: 'mock' };
  });

  router.add('POST', '/api/owner/connections/gmail/sign-in', 'owner', async ({ caller }) => {
    staffOf(caller);
    return startGoogleSignIn(platform, `${site()}/api/connect/gmail/callback`);
  });

  // The owner app asks for new mail each time it refreshes. The inbox is read at most once a minute.
  router.add('POST', '/api/owner/inbox/sync', 'staff', async ({ caller, json }) => {
    staffOf(caller);
    return syncGmail(platform, { force: json.force === true });
  });
}
