import { server } from '@/lib/platform';

export const dynamic = 'force-dynamic';

// The owner app runs on its own address. Only that address may call the API from a browser.
function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (process.env.OWNER_APP_ORIGIN ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', vary: 'Origin' };
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => (headers[key.toLowerCase()] = value));
  const { api } = await server();
  const response = await api({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body: await request.text() });
  return new Response(response.body === null || response.body === undefined ? null : JSON.stringify(response.body), {
    status: response.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(request), ...response.headers },
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
