import type { NextConfig } from 'next';
import { join } from 'node:path';
import { securityHeaders } from './src/lib/security-headers';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '..', '..'),
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') },
    ]),
};

export default config;
