import type { Locale } from '../i18n/locale.js';
import { formatAmountInput } from '../money/format-money.js';
import type { Transaction } from '../transactions/transactions.service.js';

const BYTE_ORDER_MARK = '﻿';
const LINE_END = '\r\n';
const FORMULA_START = /^[=+\-@\t\r]/;

interface CsvWording {
  readonly separator: string;
  readonly headings: readonly string[];
  readonly types: Readonly<Record<Transaction['type'], string>>;
}

const WORDING: Readonly<Record<Locale, CsvWording>> = {
  en: {
    separator: ',',
    headings: [
      'Date',
      'Type',
      'Amount',
      'Currency',
      'Merchant',
      'Description',
      'Category',
      'Account',
      'Destination account',
      'Member',
    ],
    types: { EXPENSE: 'Expense', INCOME: 'Income', TRANSFER: 'Transfer' },
  },
  'pt-BR': {
    separator: ';',
    headings: [
      'Data',
      'Tipo',
      'Valor',
      'Moeda',
      'Estabelecimento',
      'Descrição',
      'Categoria',
      'Conta',
      'Conta de destino',
      'Quem',
    ],
    types: { EXPENSE: 'Gasto', INCOME: 'Receita', TRANSFER: 'Transferência' },
  },
};

export interface CsvNames {
  readonly members: ReadonlyMap<string, string>;
  readonly accounts: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, string>;
}

export function transactionsCsv(
  rows: readonly Transaction[],
  names: CsvNames,
  locale: Locale,
): string {
  const wording = WORDING[locale];
  const line = (cells: readonly string[]): string =>
    cells.map((cell) => csvCell(cell, wording.separator)).join(wording.separator);
  const nameIn = (map: ReadonlyMap<string, string>, id: string | null): string =>
    id === null ? '' : (map.get(id) ?? '');
  return (
    BYTE_ORDER_MARK +
    [
      line(wording.headings),
      ...rows.map((row) =>
        line([
          row.transactionDate,
          wording.types[row.type],
          formatAmountInput(row.amountMinor, row.currency, locale),
          row.currency,
          row.merchant ?? '',
          row.description ?? '',
          nameIn(names.categories, row.categoryId),
          nameIn(names.accounts, row.accountId),
          nameIn(names.accounts, row.transferAccountId),
          nameIn(names.members, row.memberId),
        ]),
      ),
    ].join(LINE_END) +
    LINE_END
  );
}

export function csvCell(value: string, separator: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  const needsQuotes =
    guarded.includes(separator) ||
    guarded.includes('"') ||
    guarded.includes('\n') ||
    guarded.includes('\r');
  return needsQuotes ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}
