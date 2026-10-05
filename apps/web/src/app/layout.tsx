import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { dictionaryFor, localeFromAcceptLanguage } from '@/lib/i18n/dictionary';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionaryFor(localeFromAcceptLanguage((await headers()).get('accept-language')));
  return {
    title: t.brand,
    description: t.description,
    applicationName: t.brand,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icons/favicon-64.png', sizes: '64x64', type: 'image/png' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: { capable: true, title: t.brand, statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f3f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1311' },
  ],
};

export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const locale = localeFromAcceptLanguage((await headers()).get('accept-language'));
  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
