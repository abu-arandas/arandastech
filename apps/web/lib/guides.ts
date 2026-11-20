import type { Locale } from './i18n';
import { GUIDES } from './guides-content';

/**
 * The search pages: one page per question a buyer types into a search engine ("Flutter POS source code", "POS with
 * JoFotara"), in English and Arabic. Every fact on them comes from the products' own documentation; the words live in
 * guides-content.ts, and this file holds their shape and the helpers the pages use.
 */

export type L = { en: string; ar: string };

interface GuideSection {
  heading: L;
  body: L[];
  points?: L[];
}

/** A comparison table: the first column names the row, the rest are one column per option. */
export interface GuideTable {
  head: L[];
  rows: L[][];
}

/** A product the page is about, for the structured data search engines read (schema.org SoftwareApplication). */
export interface GuideProduct {
  name: string;
  os: string;
  price: string;
  currency: 'USD' | 'JOD';
}

export interface Guide {
  slug: string;
  title: L;
  /** The line a search engine shows under the title: under 160 characters. */
  description: L;
  intro: L;
  sections: GuideSection[];
  table?: GuideTable;
  links: { href: string; label: L }[];
  product?: GuideProduct;
}

export { GUIDES };

export const findGuide = (slug: string): Guide | undefined => GUIDES.find((guide) => guide.slug === slug);

export const say = (text: L, locale: Locale): string => text[locale];

/** A link inside the site gets the visitor's language in front ("/contact" becomes "/ar/contact"). */
export const linkFor = (href: string, locale: Locale): string => (href.startsWith('/') ? `/${locale}${href}` : href);

/** The schema.org record for a page about one product, or nothing for a page about several. */
export function structuredData(guide: Guide, locale: Locale, url: string): Record<string, unknown> | undefined {
  if (!guide.product) return undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: guide.product.name,
    description: say(guide.description, locale),
    applicationCategory: 'BusinessApplication',
    operatingSystem: guide.product.os,
    inLanguage: ['en', 'ar'],
    url,
    offers: { '@type': 'Offer', price: guide.product.price, priceCurrency: guide.product.currency },
    publisher: { '@type': 'Organization', name: 'Zirr' },
  };
}
