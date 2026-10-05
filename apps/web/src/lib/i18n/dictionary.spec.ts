import { dictionaryFor, EN, localeFromAcceptLanguage, PT_BR } from './dictionary';

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('dictionaries', () => {
  it('have the same keys in every language', () => {
    expect(keysOf(PT_BR).sort()).toEqual(keysOf(EN).sort());
  });

  it('are chosen by the household language', () => {
    expect(dictionaryFor('pt-BR').nav.overview).toBe('Início');
    expect(dictionaryFor('en').nav.overview).toBe('Overview');
  });

  it.each([
    ['pt-BR,pt;q=0.9,en;q=0.8', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['en-IE,en;q=0.9', 'en'],
    [null, 'en'],
    ['', 'en'],
  ] as const)('reads %s from the browser as %s', (header, locale) => {
    expect(localeFromAcceptLanguage(header)).toBe(locale);
  });

  it('agrees numbers in Portuguese', () => {
    expect(PT_BR.common.daysLeft(1)).toBe('falta 1 dia');
    expect(PT_BR.common.daysLeft(11)).toBe('faltam 11 dias');
    expect(PT_BR.common.transactions(1)).toBe('1 movimento');
    expect(PT_BR.transactions.summary(42, 1, 2)).toBe('42 movimentos · página 1 de 2');
  });
});
