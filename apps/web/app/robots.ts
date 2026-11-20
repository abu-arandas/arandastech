import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/platform';

/** Search engines may read the shop, never the API, and find every page in the sitemap. A demo installation asks them to stay away altogether. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.DEMO_MODE === 'true') return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: `${siteUrl()}/sitemap.xml` };
}
