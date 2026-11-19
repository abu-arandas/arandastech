import type { z } from 'zod';
import { forbidden, invalid } from '../lib/errors';
import type { Caller } from './http';

/** The caller as a member of the team, or a refusal for anyone else. */
export const staffOf = (caller: Caller) => {
  if (caller.kind !== 'staff') throw forbidden('This is for the team only.');
  return caller;
};

/** The request body (or a path value) checked against [schema], or a refusal that names each missing field. */
export const check = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw invalid(
      'The request is not complete.',
      parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    );
  return parsed.data;
};
