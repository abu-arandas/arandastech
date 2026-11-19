import type { Locale } from '../lib/types';

/** A workflow's input and the records it reads, as plain JSON. */
export type Json = Record<string, unknown>;

/** The English or the Arabic of a fixed sentence, by the reader's language. */
export const say = (en: string, ar: string, locale: Locale): string => (locale === 'ar' ? ar : en);
