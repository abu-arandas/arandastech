import { server } from '@/lib/platform';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The departments' daily run (vercel.json crons): it queues the briefing and Security's review once per day, then
 * works through what is due. Vercel sends CRON_SECRET as a bearer token when it is set, and then nothing else may call
 * this. Without it, calling it again changes nothing: the daily jobs are queued once per day.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ error: { code: 'unauthorized', message: 'Sign in to use this.' } }, { status: 401 });
  const { platform } = await server();
  const queued = await platform.agents.scheduleDaily();
  const ran = await platform.agents.runDue({ budgetMs: 45_000 });
  return Response.json({ queued, ran }, { headers: { 'cache-control': 'no-store' } });
}
