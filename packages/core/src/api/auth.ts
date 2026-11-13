import { jwtVerify } from 'jose';
import type { Db } from '../lib/db';
import { AppError } from '../lib/errors';
import { sameSignature, sha256 } from '../lib/hash';
import { bearer, type Caller } from './http';

export interface AuthConfig {
  /** A long random token for a single-owner installation. The app sends it as a bearer token. */
  ownerToken?: string;
  /** Which staff member that token acts as. */
  ownerUserId?: string;
  /** The Supabase JWT secret. When set, a signed-in Supabase user who is an active staff member is accepted. */
  supabaseJwtSecret?: string;
  /** One token per department, for the bots: `{ "<token>": "sales" }`. */
  agentTokens: Record<string, string>;
}

// Compare hashes, so that the comparison takes the same time whatever the token is.
const sameToken = (given: string, expected: string): boolean => sameSignature(sha256(given), sha256(expected));

const unauthorized = (): AppError => new AppError('unauthorized', 'Sign in to use this.', 401);

/** Works out who is calling from the Authorization header. Throws 401 when the token is missing or wrong. */
export async function authenticate(db: Db, config: AuthConfig, headers: Record<string, string>): Promise<Caller> {
  const token = bearer(headers);
  if (!token) throw unauthorized();

  for (const [agentToken, department] of Object.entries(config.agentTokens)) {
    if (sameToken(token, agentToken)) return { kind: 'agent', actor: { kind: 'agent', id: department }, department };
  }

  let userId: string | null = null;
  if (config.ownerToken && config.ownerUserId && sameToken(token, config.ownerToken)) userId = config.ownerUserId;
  else if (config.supabaseJwtSecret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(config.supabaseJwtSecret), { algorithms: ['HS256'] });
      userId = typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      throw unauthorized();
    }
  }
  if (!userId) throw unauthorized();

  const staff = (await db.query<{ role: string }>('select role from staff_members where user_id = $1 and active', [userId]))[0];
  if (!staff) throw new AppError('forbidden', 'This account is not on the team.', 403);
  return { kind: 'staff', actor: { kind: 'person', id: userId }, isOwner: staff.role === 'owner' };
}
