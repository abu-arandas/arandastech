import { describe, expect, it } from 'vitest';
import { isConnectionError } from '../src/lib/db';

describe('broken connections', () => {
  it('knows a connection the server or network closed', () => {
    expect(isConnectionError(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(
      isConnectionError(
        Object.assign(new Error('Client network socket disconnected before secure TLS connection was established'), {
          code: 'ECONNRESET',
        }),
      ),
    ).toBe(true);
    expect(isConnectionError(Object.assign(new Error('terminating connection'), { code: '57P01' }))).toBe(true);
  });

  it('leaves query errors alone, so they are never sent twice', () => {
    expect(isConnectionError(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe(false);
    expect(isConnectionError(new Error('syntax error at or near "selec"'))).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});
