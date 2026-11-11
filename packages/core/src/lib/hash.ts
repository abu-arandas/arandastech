import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** JSON with object keys in a fixed order, so that equal values always produce equal text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The hash an approval is tied to. Any change to the payload changes it. */
export function payloadHash(payload: unknown): string {
  return sha256(canonicalJson(payload));
}

export function hmacSha256(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** Compares two hex signatures without leaking where they differ. */
export function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}
