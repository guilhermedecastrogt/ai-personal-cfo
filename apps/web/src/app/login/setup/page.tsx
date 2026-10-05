import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { dictionaryFor, localeFromAcceptLanguage } from '@/lib/i18n/dictionary';
import { SetUpForm } from './setup-form';

export default async function SetUpPage(): Promise<ReactNode> {
  const locale = localeFromAcceptLanguage((await headers()).get('accept-language'));
  const t = dictionaryFor(locale);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <p className="eyebrow text-brass">{t.brand}</p>
      <h1 className="mt-4 font-display text-[2.2rem] leading-[1.1] tracking-tight">
        {t.login.setUpHeadline}
      </h1>
      <p className="mt-4 text-muted">{t.login.setUpIntro}</p>
      <SetUpForm locale={locale} />
    </main>
  );
}
