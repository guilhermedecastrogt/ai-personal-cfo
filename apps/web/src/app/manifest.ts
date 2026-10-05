import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { dictionaryFor, localeFromAcceptLanguage } from '@/lib/i18n/dictionary';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = localeFromAcceptLanguage((await headers()).get('accept-language'));
  const t = dictionaryFor(locale);
  return {
    name: t.brand,
    short_name: t.brand,
    description: t.description,
    lang: locale,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0d1311',
    theme_color: '#0d1311',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
