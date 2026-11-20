import type { Metadata } from 'next';
import { type Locale, t } from './i18n';

/**
 * A page's title and description for search engines, its own address as the canonical one, and its twin in the other
 * language. `path` is the page's address after the language, such as "/contact", or "" for the home page.
 */
export function pageMetadata(locale: Locale, path: string, title: string, description: string): Metadata {
  return {
    title: path ? `${title} · ${t('brand', locale)}` : title,
    description,
    alternates: { canonical: `/${locale}${path}`, languages: { en: `/en${path}`, ar: `/ar${path}` } },
    openGraph: { title, description, locale: locale === 'ar' ? 'ar_JO' : 'en_US', siteName: t('brand', locale) },
  };
}

/** A schema.org record as the text of a script tag: "<" is escaped so no text inside can close the tag early. */
export const jsonLd = (data: unknown): { __html: string } => ({
  __html: JSON.stringify(data).replace(/</g, '\\u003c'),
});
