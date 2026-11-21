import { call } from './platform';

/** The free days from the policy sheet, so the pages say what the emails say. 14 if the platform cannot answer. */
export async function trialDays(): Promise<number> {
  try {
    const answer = await call<{ days: number }>('GET', '/api/public/trial');
    return answer.ok ? answer.data.days : 14;
  } catch {
    return 14;
  }
}

export const withDays = (text: string, days: number): string => text.replaceAll('{days}', String(days));
