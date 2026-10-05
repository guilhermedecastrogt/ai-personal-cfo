import { cache } from 'react';
import { apiGet } from './api';
import type { SessionView } from './contracts';
import { dictionaryFor, type Dictionary } from './i18n/dictionary';

export const currentSession = cache((): Promise<SessionView> =>
  apiGet<SessionView>('/dashboard/session'),
);

export async function currentDictionary(): Promise<Dictionary> {
  return dictionaryFor((await currentSession()).locale);
}
