import type { z } from 'zod';
import { invalid } from './errors';

/** [value] checked against [schema], or a refusal with [message] that names each field that is wrong. */
export function parseOrRefuse<T>(schema: z.ZodType<T>, value: unknown, message = 'The request is not complete.'): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw invalid(
      message,
      parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    );
  return parsed.data;
}
