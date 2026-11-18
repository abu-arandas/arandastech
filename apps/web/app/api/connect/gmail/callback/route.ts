import { finishGoogleSignIn } from '@zirr/core';
import { server, siteUrl } from '@/lib/platform';

export const dynamic = 'force-dynamic';

const page = (title: string, text: string, status: number): Response =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0d111c;color:#e8ecf5;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{max-width:420px}h1{font-size:1.4rem}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Where Google sends the owner back after Sign in with Google. The platform keeps the sign-in and switches Gmail live. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error'))
    return page(
      'Gmail was not connected',
      'Google sign-in was cancelled. Press Sign in with Google in the owner app to try again.',
      400,
    );
  if (!code || !state)
    return page('Gmail was not connected', 'This link is not complete. Start again from the owner app.', 400);
  try {
    const { platform } = await server();
    const { address } = await finishGoogleSignIn(platform, {
      code,
      state,
      redirectUri: `${siteUrl()}/api/connect/gmail/callback`,
    });
    return page(
      'Gmail is connected',
      `The platform now reads and answers ${escape(address)}. You can close this tab and go back to the owner app.`,
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return page('Gmail was not connected', escape(message), 400);
  }
}
