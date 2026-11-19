import { hmacSha256, randomToken } from '../lib/hash';

/** Builds a provider notice and signs it the way the mock provider does. Used by the tests and the demo. */
export function signedEvent(
  secret: string,
  type: string,
  data: Record<string, unknown>,
  id = `evt_${randomToken(8)}`,
): { body: string; signature: string } {
  const body = JSON.stringify({ id, type, data });
  return { body, signature: hmacSha256(secret, body) };
}
