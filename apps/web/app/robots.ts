import type { MetadataRoute } from 'next';

/** Search engines may read the shop, never the API. A demo installation asks them to stay away altogether. */
export default function robots(): MetadataRoute.Robots {
  const demo = process.env.DEMO_MODE === 'true';
  return { rules: demo ? { userAgent: '*', disallow: '/' } : { userAgent: '*', allow: '/', disallow: '/api/' } };
}
