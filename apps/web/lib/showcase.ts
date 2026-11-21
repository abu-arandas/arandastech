import type { Locale } from './i18n';

/**
 * The pictures and live demos of the products on sale, by catalogue slug. The pictures are screenshots of the real,
 * live apps (public/shots), made small as WebP. A product the catalogue adds without a row here simply shows no picture.
 */
interface Showcase {
  shot: string;
  phone: string;
  live: string;
}

const SHOWCASE: Record<string, { en: Showcase; ar?: Partial<Showcase> }> = {
  'zirr-retail': {
    en: { shot: '/shots/retail-shop.webp', phone: '/shots/retail-phone.webp', live: 'https://erp-house.vercel.app' },
    ar: { shot: '/shots/retail-shop-ar.webp', phone: '/shots/retail-phone-ar.webp' },
  },
  'zirr-boutique': {
    en: {
      shot: '/shots/boutique-shop.webp',
      phone: '/shots/boutique-phone.webp',
      live: 'https://vanguard-demo-ehab-arandas.vercel.app',
    },
  },
};

export function showcase(slug: string, locale: Locale): Showcase | undefined {
  const row = SHOWCASE[slug];
  if (!row) return undefined;
  return locale === 'ar' ? { ...row.en, ...row.ar } : row.en;
}

/** The hero's pictures: the Retail shop, in the page's language. */
export const heroShots = (locale: Locale): Showcase => showcase('zirr-retail', locale)!;
