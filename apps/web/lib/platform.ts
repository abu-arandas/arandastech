import { createApi, createDb, createPlatform, type Db, type Platform, readSecrets, SECRETS, type SecretName } from '@zirr/core';

type Api = ReturnType<typeof createApi>;
type Server = { platform: Platform; api: Api };
const globals = globalThis as { __zirr?: Promise<Server> };

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See apps/web/.env.example.`);
  return value;
};

async function build(): Promise<Server> {
  const db = createDb(need('DATABASE_URL'));
  try {
    return await connect(db);
  } catch (error) {
    await db.close().catch(() => undefined);
    throw error;
  }
}

async function connect(db: Db): Promise<Server> {
  // A setting wins. Without one, the secret db:deploy made in the database is used, so nobody has to copy it by hand.
  const stored = await readSecrets(db);
  const secret = (name: SecretName): string | undefined => process.env[SECRETS[name]] || stored[name];
  const required = (name: SecretName): string => {
    const value = secret(name);
    if (!value) throw new Error(`${SECRETS[name]} is not set, and the database has none. See apps/web/.env.example.`);
    return value;
  };
  const platform = createPlatform(db, {
    demo: process.env.DEMO_MODE === 'true',
    webhookSecrets: { payments: required('payments_webhook_secret'), supplier: required('supplier_webhook_secret') },
  });
  const api = createApi(platform, {
    ownerToken: secret('owner_api_token'),
    ownerUserId: process.env.OWNER_USER_ID || undefined,
    supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || undefined,
    agentTokens: JSON.parse(process.env.AGENT_TOKENS || '{}') as Record<string, string>,
  });
  return { platform, api };
}

/** One platform per server process, built from the environment on first use. A failed start is tried again on the next call. */
export function server(): Promise<Server> {
  globals.__zirr ??= build().catch((error: unknown) => {
    globals.__zirr = undefined;
    throw error;
  });
  return globals.__zirr;
}

/** Calls the same API the owner app and the bots use, without going over the network. */
export async function call<T>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const [pathname, search = ''] = path.split('?');
  const { api } = await server();
  const response = await api({ method, path: pathname!, query: Object.fromEntries(new URLSearchParams(search)), headers: {}, body: body === undefined ? '' : JSON.stringify(body) });
  const data = response.body as T & { error?: { message: string } };
  return { ok: response.status < 400, status: response.status, data, error: data?.error?.message };
}
