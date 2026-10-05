import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security-headers';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') },
    ]),
};

export default config;
