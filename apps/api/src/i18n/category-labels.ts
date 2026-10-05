import type { Locale } from './locale.js';

const PORTUGUESE: Readonly<Record<string, string>> = {
  Food: 'Alimentação',
  Groceries: 'Mercado',
  Restaurants: 'Restaurantes',
  Coffee: 'Café',
  Delivery: 'Delivery',
  Housing: 'Moradia',
  Rent: 'Aluguel',
  Electricity: 'Energia',
  Internet: 'Internet',
  Transport: 'Transporte',
  Fuel: 'Combustível',
  'Public Transport': 'Transporte público',
  Uber: 'Uber',
  Health: 'Saúde',
  Shopping: 'Compras',
  Entertainment: 'Lazer',
  Education: 'Educação',
  Travel: 'Viagens',
  Subscriptions: 'Assinaturas',
  Other: 'Outros',
  Salary: 'Salário',
  Freelance: 'Freelance',
};

const LABELS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {},
  'pt-BR': PORTUGUESE,
};

export function categoryLabel(canonicalName: string, locale: Locale): string {
  return LABELS[locale][canonicalName] ?? canonicalName;
}
