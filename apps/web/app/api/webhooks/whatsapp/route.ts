import { whatsappVerify } from '@zirr/core';
import { server, workAfterResponse } from '@/lib/platform';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Meta's check when the webhook address is saved: it expects the challenge back as plain text. */
export async function GET(request: Request): Promise<Response> {
  const { platform } = await server();
  try {
    const challenge = await whatsappVerify(platform, Object.fromEntries(new URL(request.url).searchParams));
    return new Response(challenge, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
  } catch {
    return new Response('forbidden', { status: 403 });
  }
}

/** Incoming messages go through the platform's API, which checks Meta's signature. */
export async function POST(request: Request): Promise<Response> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => (headers[key.toLowerCase()] = value));
  const { api } = await server();
  const response = await api({
    method: 'POST',
    path: '/api/webhooks/whatsapp',
    query: {},
    headers,
    body: await request.text(),
  });
  if (response.status < 400) workAfterResponse();
  return Response.json(response.body, { status: response.status });
}
