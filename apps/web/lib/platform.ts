import { createApi, createDb, createPlatform, type Platform } from '@arandas/core';

type Api = ReturnType<typeof createApi>;
const globals = globalThis as { __arandas?: { platform: Platform; api: Api } };

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See apps/web/.env.example.`);
  return value;
};

/** One platform per server process, built from the environment on first use. */
export function server(): { platform: Platform; api: Api } {
  if (!globals.__arandas) {
    const platform = createPlatform(createDb(need('DATABASE_URL')), {
      demo: process.env.DEMO_MODE === 'true',
      webhookSecrets: { payments: need('PAYMENTS_WEBHOOK_SECRET'), supplier: need('SUPPLIER_WEBHOOK_SECRET') },
    });
    const api = createApi(platform, {
      ownerToken: process.env.OWNER_API_TOKEN || undefined,
      ownerUserId: process.env.OWNER_USER_ID || undefined,
      supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || undefined,
      agentTokens: JSON.parse(process.env.AGENT_TOKENS || '{}') as Record<string, string>,
    });
    globals.__arandas = { platform, api };
  }
  return globals.__arandas;
}

/** Calls the same API the owner app and the bots use, without going over the network. */
export async function call<T>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const [pathname, search = ''] = path.split('?');
  const response = await server().api({ method, path: pathname!, query: Object.fromEntries(new URLSearchParams(search)), headers: {}, body: body === undefined ? '' : JSON.stringify(body) });
  const data = response.body as T & { error?: { message: string } };
  return { ok: response.status < 400, status: response.status, data, error: data?.error?.message };
}
