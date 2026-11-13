import { server } from '@/lib/platform';

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => (headers[key.toLowerCase()] = value));
  const response = await server().api({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body: await request.text() });
  return new Response(response.body === null || response.body === undefined ? null : JSON.stringify(response.body), {
    status: response.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...response.headers },
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
