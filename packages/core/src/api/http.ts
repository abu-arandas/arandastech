import { AppError } from '../lib/errors';
import type { Actor } from '../lib/types';

/** A request in a form that does not depend on any web framework. */
export interface ApiRequest {
  method: string;
  /** The path after the host, without the query string: `/api/owner/approvals`. */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** The body exactly as it arrived. Webhook signatures are checked against these bytes. */
  body: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** Who is calling: nobody, the owner or a team member, or one department's bot. */
export type Caller =
  | { kind: 'public' }
  | { kind: 'staff'; actor: Actor; isOwner: boolean }
  | { kind: 'agent'; actor: Actor; department: string };

export interface RouteContext {
  request: ApiRequest;
  params: Record<string, string>;
  caller: Caller;
  /** The parsed JSON body, or an empty object. */
  json: Record<string, unknown>;
}

export type Handler = (ctx: RouteContext) => Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  access: 'public' | 'staff' | 'owner' | 'demo';
  handler: Handler;
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, path: string, access: Route['access'], handler: Handler): void {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, key: string) => (keys.push(key), '([^/]+)'))}/?$`);
    this.routes.push({ method, pattern, keys, access, handler });
  }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | 'wrong_method' | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const hit = route.pattern.exec(path);
      if (!hit) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => (params[key] = decodeURIComponent(hit[index + 1] ?? '')));
      return { route, params };
    }
    return pathMatched ? 'wrong_method' : null;
  }
}

export function parseJson(body: string): Record<string, unknown> {
  if (!body.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new AppError('invalid', 'The request body is not a JSON object.', 400);
}

export function errorResponse(error: unknown): ApiResponse {
  if (error instanceof AppError) return { status: error.status, body: { error: { code: error.code, message: error.message, detail: error.detail ?? null } } };
  // Never show an internal error to the caller: it can carry details an outsider should not see.
  return { status: 500, body: { error: { code: 'internal', message: 'Something went wrong on our side.' } } };
}

export const bearer = (headers: Record<string, string>): string | null => {
  const match = /^Bearer\s+(.+)$/i.exec(headers.authorization ?? '');
  return match ? match[1]!.trim() : null;
};
