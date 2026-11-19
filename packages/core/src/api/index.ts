import type { Platform } from '../platform';
import { authenticate, type AuthConfig } from './auth';
import { type ApiRequest, type ApiResponse, type Caller, errorResponse, parseJson, Router } from './http';
import { handleMcp } from './mcp';
import { registerRoutes } from './routes';
import { AppError } from '../lib/errors';
import { callerKey, LIMITS, limit, overLimit } from '../lib/rate-limit';

export type { ApiRequest, ApiResponse } from './http';
export type { AuthConfig } from './auth';

/**
 * Builds the whole HTTP API as one function from request to response. The web app and the tests both call it, so
 * what is tested is exactly what is served.
 */
export function createApi(platform: Platform, auth: AuthConfig): (request: ApiRequest) => Promise<ApiResponse> {
  const router = new Router();
  registerRoutes(router, platform);

  // The public doors that write, and what each counts against (blueprint 10.1).
  const limited: Record<string, keyof typeof LIMITS> = {
    'POST /api/public/leads': 'lead',
    'POST /api/public/checkout': 'checkout',
    'POST /api/demo/pay': 'checkout',
    'POST /api/public/pay': 'checkout',
  };

  /** Signs the caller in, counting failures against the address, so a token cannot be guessed by trying. */
  const signIn = async (request: ApiRequest): Promise<Caller> => {
    const who = callerKey(request.headers);
    const now = platform.clock();
    const waiting = await overLimit(platform.db, 'sign_in', who, now);
    if (waiting) throw new AppError('rate_limited', LIMITS.sign_in.message, 429, { retry_after_seconds: waiting });
    try {
      return await authenticate(platform.db, auth, request.headers);
    } catch (error) {
      // A failure that cannot be counted fails the request, so a guess is never free.
      if (error instanceof AppError && error.status === 401) await limit(platform.db, 'sign_in', who, now);
      throw error;
    }
  };

  return async (request) => {
    try {
      if (request.path === '/api/mcp' || request.path === '/api/mcp/') {
        // Bots talk to this one address. There is no event stream to open, so anything but POST is refused.
        if (request.method !== 'POST')
          return {
            status: 405,
            body: { error: { code: 'method_not_allowed', message: 'Use POST.' } },
            headers: { allow: 'POST' },
          };
        const caller = await signIn(request);
        if (caller.kind !== 'agent' || !caller.actor.id)
          throw new AppError('forbidden', 'This address is for the department bots.', 403);
        return await handleMcp(platform, { kind: 'agent', id: caller.actor.id }, request.body);
      }

      const found = router.match(request.method, request.path);
      if (found === 'wrong_method')
        return {
          status: 405,
          body: { error: { code: 'method_not_allowed', message: 'This address does not accept that method.' } },
        };
      const demoOnly = found?.route.access.startsWith('demo') ?? false;
      if (!found || (demoOnly && !platform.config.demo))
        return { status: 404, body: { error: { code: 'not_found', message: 'There is nothing at this address.' } } };

      let caller: Caller = { kind: 'public' };
      const access = found.route.access;
      if (access === 'staff' || access === 'owner' || access === 'demo_owner') {
        caller = await signIn(request);
        if (caller.kind !== 'staff') throw new AppError('forbidden', 'This is for the team only.', 403);
        if (access !== 'staff' && !caller.isOwner) throw new AppError('forbidden', 'Only the owner can do this.', 403);
      }
      const door =
        limited[`${request.method} ${request.path.replace(/\/$/, '')}`] ??
        (/^\/api\/public\/(orders|proposals|invoices|unsubscribe)\//.test(request.path) ? 'lookup' : undefined);
      if (door) await limit(platform.db, door, callerKey(request.headers), platform.clock());
      // Webhooks and the one-click unsubscribe arrive as form posts, not JSON; their handlers read the raw body.
      const raw = request.path.startsWith('/api/webhooks/') || request.path.startsWith('/api/public/unsubscribe/');
      const json = raw || request.method === 'GET' ? {} : parseJson(request.body);
      const body = await found.route.handler({ request, params: found.params, caller, json });
      return { status: 200, body };
    } catch (error) {
      if (!(error instanceof AppError)) console.error('[api]', request.method, request.path, error);
      const response = errorResponse(error);
      const retry = (error as AppError | undefined)?.detail as { retry_after_seconds?: number } | undefined;
      if (response.status === 429 && retry?.retry_after_seconds)
        response.headers = { 'retry-after': String(retry.retry_after_seconds) };
      return response;
    }
  };
}
