import type { Transaction } from '../transactions/transactions.service.js';
import { csvCell, transactionsCsv } from './transactions-csv.js';

const ROW: Transaction = {
  id: 'transaction',
  householdId: 'household',
  memberId: 'renata',
  accountId: 'joint',
  transferAccountId: null,
  type: 'EXPENSE',
  amountMinor: 123456,
  currency: 'EUR',
  merchant: 'Café; "Central"',
  description: '=HYPERLINK("http://evil")',
  categoryId: 'coffee',
  expenseScope: 'HOUSEHOLD',
  transactionDate: '2026-10-03',
  paymentMethod: null,
  source: 'WHATSAPP_TEXT',
  sourceMessageId: null,
  aiConfidence: null,
  createdAt: new Date('2026-10-03T10:00:00Z'),
  updatedAt: new Date('2026-10-03T10:00:00Z'),
};

const NAMES = {
  members: new Map([['renata', 'Renata']]),
  accounts: new Map([['joint', 'Conta Conjunta']]),
  categories: new Map([['coffee', 'Café']]),
};

describe('transactionsCsv', () => {
  it('writes a Portuguese file that spreadsheets open with accents and decimal commas', () => {
    expect(transactionsCsv([ROW], NAMES, 'pt-BR')).toBe(
      '﻿Data;Tipo;Valor;Moeda;Estabelecimento;Descrição;Categoria;Conta;Conta de destino;Quem\r\n' +
        `2026-10-03;Gasto;1234,56;EUR;"Café; ""Central""";"'=HYPERLINK(""http://evil"")";Café;Conta Conjunta;;Renata\r\n`,
    );
  });

  it('writes an English file with commas and decimal points', () => {
    expect(transactionsCsv([ROW], NAMES, 'en').split('\r\n')[1]).toBe(
      `2026-10-03,Expense,1234.56,EUR,"Café; ""Central""","'=HYPERLINK(""http://evil"")",Café,Conta Conjunta,,Renata`,
    );
  });
});

describe('csvCell', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx'])('neutralises the formula %j', (value) => {
    expect(csvCell(value, ';').startsWith("'")).toBe(true);
  });

  it('leaves ordinary text alone', () => {
    expect(csvCell('Lidl', ';')).toBe('Lidl');
  });
});
