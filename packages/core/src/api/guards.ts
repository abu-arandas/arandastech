import type { z } from 'zod';
import { forbidden } from '../lib/errors';
import { parseOrRefuse } from '../lib/validate';
import type { Caller } from './http';

/** The caller as a member of the team, or a refusal for anyone else. */
export const staffOf = (caller: Caller) => {
  if (caller.kind !== 'staff') throw forbidden('This is for the team only.');
  return caller;
};

/** The request body (or a path value) checked against [schema], or a refusal that names each missing field. */
export const check = <T>(schema: z.ZodType<T>, value: unknown): T => parseOrRefuse(schema, value);
