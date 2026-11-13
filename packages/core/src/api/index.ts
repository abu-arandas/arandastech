import type { Platform } from '../platform';
import { authenticate, type AuthConfig } from './auth';
import { type ApiRequest, type ApiResponse, type Caller, errorResponse, parseJson, Router } from './http';
import { handleMcp } from './mcp';
import { registerRoutes } from './routes';
import { AppError } from '../lib/errors';

export type { ApiRequest, ApiResponse } from './http';
export type { AuthConfig } from './auth';

/**
 * Builds the whole HTTP API as one function from request to response. The web app and the tests both call it, so
 * what is tested is exactly what is served.
 */
export function createApi(platform: Platform, auth: AuthConfig): (request: ApiRequest) => Promise<ApiResponse> {
  const router = new Router();
  registerRoutes(router, platform);

  return async (request) => {
    try {
      if (request.path === '/api/mcp' || request.path === '/api/mcp/') {
        // Bots talk to this one address. There is no event stream to open, so anything but POST is refused.
        if (request.method !== 'POST') return { status: 405, body: { error: { code: 'method_not_allowed', message: 'Use POST.' } }, headers: { allow: 'POST' } };
        const caller = await authenticate(platform.db, auth, request.headers);
        if (caller.kind !== 'agent' || !caller.actor.id) throw new AppError('forbidden', 'This address is for the department bots.', 403);
        return await handleMcp(platform, { kind: 'agent', id: caller.actor.id }, request.body);
      }

      const found = router.match(request.method, request.path);
      if (found === 'wrong_method') return { status: 405, body: { error: { code: 'method_not_allowed', message: 'This address does not accept that method.' } } };
      if (!found || (found.route.access === 'demo' && !platform.config.demo)) return { status: 404, body: { error: { code: 'not_found', message: 'There is nothing at this address.' } } };

      let caller: Caller = { kind: 'public' };
      if (found.route.access === 'staff' || found.route.access === 'owner') {
        caller = await authenticate(platform.db, auth, request.headers);
        if (caller.kind !== 'staff') throw new AppError('forbidden', 'This is for the team only.', 403);
        if (found.route.access === 'owner' && !caller.isOwner) throw new AppError('forbidden', 'Only the owner can do this.', 403);
      }
      const json = request.path.startsWith('/api/webhooks/') || request.method === 'GET' ? {} : parseJson(request.body);
      const body = await found.route.handler({ request, params: found.params, caller, json });
      return { status: 200, body };
    } catch (error) {
      if (!(error instanceof AppError)) console.error('[api]', request.method, request.path, error);
      return errorResponse(error);
    }
  };
}
