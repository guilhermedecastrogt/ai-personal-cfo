import { EN, type Dictionary } from './en';
import { PT_BR } from './pt-BR';

export type { Dictionary };

export type Locale = 'en' | 'pt-BR';

const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { en: EN, 'pt-BR': PT_BR };

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export function localeFromAcceptLanguage(header: string | null): Locale {
  const first = (header ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('pt') ? 'pt-BR' : 'en';
}

export { EN, PT_BR };
