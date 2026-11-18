import { after } from 'next/server';
import {
  ClaudeModel,
  DEFAULT_MODEL,
  chooseSecret,
  createApi,
  createDb,
  createPlatform,
  type Db,
  type Platform,
  readAgentTokens,
  readSecrets,
  readStoredKey,
  SECRETS,
  type SecretName,
} from '@zirr/core';

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
  // The example's change-me never counts on Vercel, so a copied example file cannot open the site to a known token.
  const stored = await readSecrets(db);
  const hosted = Boolean(process.env.VERCEL_ENV);
  const secret = (name: SecretName): string | undefined =>
    chooseSecret(process.env[SECRETS[name]], stored[name], hosted);
  const required = (name: SecretName): string => {
    const value = secret(name);
    if (!value)
      throw new Error(
        `${SECRETS[name]} is not set (or is the example's placeholder), and the database has none. See apps/web/.env.example.`,
      );
    return value;
  };
  // The AI key: a setting first, then a key the owner put in ops.secrets. Without one the departments work in
  // manual mode, from approved templates and fixed rules, at no cost.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || (await readStoredKey(db, 'anthropic_api_key'));
  const platform = createPlatform(db, {
    demo: process.env.DEMO_MODE === 'true',
    model: apiKey ? new ClaudeModel(apiKey, process.env.AGENT_MODEL?.trim() || DEFAULT_MODEL) : null,
    webhookSecrets: { payments: required('payments_webhook_secret'), supplier: required('supplier_webhook_secret') },
  });
  const api = createApi(platform, {
    ownerToken: secret('owner_api_token'),
    ownerUserId: process.env.OWNER_USER_ID || undefined,
    supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || undefined,
    agentTokens: {
      ...(await readAgentTokens(db)),
      ...(JSON.parse(process.env.AGENT_TOKENS || '{}') as Record<string, string>),
    },
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

/**
 * Lets the departments work through the jobs that are due once the response has gone, so a new lead or message is
 * answered within seconds and nobody waits for it. The daily cron run catches anything this misses.
 */
export function workAfterResponse(): void {
  after(async () => {
    try {
      const { platform } = await server();
      await platform.agents.runDue({ budgetMs: 25_000 });
    } catch (error) {
      console.error('[agents] background run failed', error);
    }
  });
}

/** Calls the same API the owner app and the bots use, without going over the network. */
export async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const [pathname, search = ''] = path.split('?');
  const { api } = await server();
  const response = await api({
    method,
    path: pathname!,
    query: Object.fromEntries(new URLSearchParams(search)),
    headers: {},
    body: body === undefined ? '' : JSON.stringify(body),
  });
  if (method !== 'GET') workAfterResponse();
  const data = response.body as T & { error?: { message: string } };
  return { ok: response.status < 400, status: response.status, data, error: data?.error?.message };
}
