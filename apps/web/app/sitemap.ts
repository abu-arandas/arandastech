import type { MetadataRoute } from 'next';
import { GUIDES } from '@/lib/guides';
import { siteUrl } from '@/lib/platform';

/** The pages search engines should know about, in both languages, each pointing at its other-language twin. */
const PAGES = ['', '/contact', '/guides', ...GUIDES.map((guide) => `/guides/${guide.slug}`), '/privacy', '/terms'];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl();
  return PAGES.flatMap((page) =>
    (['en', 'ar'] as const).map((locale) => ({
      url: `${site}/${locale}${page}`,
      changeFrequency: page.startsWith('/guides') || page === '' ? ('weekly' as const) : ('yearly' as const),
      priority: page === '' ? 1 : page.startsWith('/guides') ? 0.8 : 0.3,
      alternates: { languages: { en: `${site}/en${page}`, ar: `${site}/ar${page}` } },
    })),
  );
}
