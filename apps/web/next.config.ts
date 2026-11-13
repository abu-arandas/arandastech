import type { NextConfig } from 'next';

const config: NextConfig = {
  // The platform package ships TypeScript source. pg stays a plain Node dependency on the server.
  transpilePackages: ['@arandas/core'],
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
};

export default config;
