import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/** Opens the site in Arabic when the visitor's browser asks for Arabic, otherwise in English. */
export async function GET(): Promise<never> {
  const wanted = (await headers()).get('accept-language') ?? '';
  redirect(/^ar\b/i.test(wanted.trim()) ? '/ar' : '/en');
}
