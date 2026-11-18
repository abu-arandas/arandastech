import type { NextConfig } from 'next';

/**
 * Browser protections for every page (blueprint 10.1). Everything the shop needs comes from this site, so nothing
 * else may load, frame it or receive its forms. Next's own start-up scripts are inline, hence 'unsafe-inline' for
 * scripts; the development server also needs 'unsafe-eval' to reload code.
 */
const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? ' ws:' : ''}`,
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.paytabs.com https://secure.paytabs.sa",
].join('; ');

const config: NextConfig = {
  // The platform package ships TypeScript source. pg stays a plain Node dependency on the server.
  transpilePackages: ['@zirr/core'],
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  // Browsers ask for /favicon.ico on their own; send them to the mark instead of a language page.
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/icon.svg', permanent: true }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'content-security-policy', value: csp },
          { key: 'x-content-type-options', value: 'nosniff' },
          { key: 'x-frame-options', value: 'DENY' },
          { key: 'referrer-policy', value: 'strict-origin-when-cross-origin' },
          { key: 'permissions-policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
};

export default config;
