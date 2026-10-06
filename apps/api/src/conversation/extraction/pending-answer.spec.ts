import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import { answerPendingTransaction } from './pending-answer.js';

const ACCOUNTS = [
  { id: 'revolut-g', name: 'Revolut Guilherme', currency: 'EUR', ownerMemberId: 'g' },
  { id: 'inter-g', name: 'Inter Guilherme', currency: 'BRL', ownerMemberId: 'g' },
  { id: 'revolut-b', name: 'Revolut Bia', currency: 'EUR', ownerMemberId: null },
];
const CATEGORIES = [
  { id: 'salary', name: 'Salário', kind: 'INCOME' as const },
  { id: 'restaurants', name: 'Restaurantes', kind: 'EXPENSE' as const },
  { id: 'groceries', name: 'Mercado', kind: 'EXPENSE' as const },
];
const SALARY: TransactionCandidate = {
  type: 'INCOME',
  amount: '1200',
  currency: 'BRL',
  merchant: 'sliftio',
  description: null,
  category: 'Salário',
  account: null,
  transferAccount: null,
  member: null,
  memberReference: 'SENDER',
  paymentMethod: null,
  date: { kind: 'TODAY' },
  confidence: 0.95,
} as TransactionCandidate;
const MEMBERS = [
  { id: 'g', name: 'Gabriel' },
  { id: 'r', name: 'Renata' },
];
const CONTEXT = { accounts: ACCOUNTS, categories: CATEGORIES, members: MEMBERS, senderId: 'g' };

function answer(text: string, reasons: readonly string[], candidate = SALARY): unknown {
  return answerPendingTransaction(text, { candidate, reasons }, CONTEXT);
}

describe('answerPendingTransaction', () => {
  it.each(['inter', 'Inter', 'na conta inter', 'pode ser no Inter Guilherme.', 'INTER!'])(
    'reads %j as the account that was asked for',
    (text) => {
      expect(answer(text, ['CURRENCY_MISMATCH'])).toEqual({
        ...SALARY,
        account: 'Inter Guilherme',
      });
    },
  );

  it('prefers the sender’s account when a name fits several', () => {
    expect(answer('revolut', ['AMBIGUOUS_ACCOUNT'])).toEqual({
      ...SALARY,
      account: 'Revolut Guilherme',
    });
  });

  it('does not guess when the words point to different accounts', () => {
    expect(answer('inter ou revolut bia', ['CURRENCY_MISMATCH'])).toBeUndefined();
  });

  it('reads a category of the right kind, without accents', () => {
    const dinner = { ...SALARY, type: 'EXPENSE', category: null } as TransactionCandidate;

    expect(answer('restaurante', ['MISSING_CATEGORY'], dinner)).toEqual({
      ...dinner,
      category: 'Restaurantes',
    });
    expect(answer('salario', ['MISSING_CATEGORY'], dinner)).toBeUndefined();
  });

  it('fills the destination of a transfer', () => {
    const transfer = { ...SALARY, type: 'TRANSFER', currency: 'EUR' } as TransactionCandidate;

    expect(answer('revolut bia', ['MISSING_TRANSFER_ACCOUNT'], transfer)).toEqual({
      ...transfer,
      transferAccount: 'Revolut Bia',
    });
  });

  it('reads the member who was asked about', () => {
    expect(answer('foi a Renata', ['UNKNOWN_MEMBER'])).toEqual({ ...SALARY, member: 'Renata' });
  });

  it('leaves a message that is not an answer to the model', () => {
    expect(answer('quanto gastei esse mês?', ['CURRENCY_MISMATCH'])).toBeUndefined();
    expect(answer('inter', ['MISSING_AMOUNT'])).toBeUndefined();
  });
});
