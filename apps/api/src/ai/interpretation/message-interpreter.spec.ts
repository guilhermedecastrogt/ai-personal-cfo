import { AIProviderError } from '../ai-provider.js';
import {
  FakeAIProvider,
  OTHER_INTERPRETATION,
  questionInterpretation,
  transactionInterpretation,
} from '../testing/fake-ai-provider.fixture.js';
import { MessageInterpreter } from './message-interpreter.js';

const REQUEST = {
  message: 'I spent 23 at Lidl',
  history: [],
  senderName: 'Member A',
  memberNames: ['Member A'],
  accountNames: ['Joint Account'],
  categories: [],
};

async function interpret(output: unknown): Promise<unknown> {
  const provider = new FakeAIProvider().willInterpretAs(output);
  return new MessageInterpreter(provider).interpret(REQUEST);
}

async function failureOf(output: unknown): Promise<string> {
  try {
    await interpret(output);
  } catch (error) {
    return error instanceof AIProviderError ? error.category : 'unexpected error';
  }
  return 'no failure';
}

describe('MessageInterpreter', () => {
  it('returns a transaction candidate', async () => {
    expect(await interpret(transactionInterpretation())).toMatchObject({
      kind: 'TRANSACTION',
      transaction: { type: 'EXPENSE', amount: '23', merchant: 'Lidl' },
    });
  });

  it('returns a question', async () => {
    expect(await interpret(questionInterpretation({ intent: 'SAVINGS' }))).toMatchObject({
      kind: 'QUESTION',
      question: { intent: 'SAVINGS' },
    });
  });

  it('returns other for anything else', async () => {
    expect(await interpret(OTHER_INTERPRETATION)).toEqual({ kind: 'OTHER' });
  });

  it('drops properties the schema does not define', async () => {
    const output = {
      ...(transactionInterpretation() as object),
      householdId: 'another-household',
      memberId: 'another-member',
    };

    const interpretation = await interpret(output);

    expect(JSON.stringify(interpretation)).not.toContain('another');
  });

  it.each([
    ['nothing', undefined],
    ['text', 'I recorded it for you'],
    ['an unknown kind', { kind: 'DELETE_EVERYTHING', transaction: null, question: null }],
    [
      'a transaction kind without a transaction',
      { kind: 'TRANSACTION', transaction: null, question: null },
    ],
    ['a question kind without a question', { kind: 'QUESTION', transaction: null, question: null }],
    ['a numeric amount', transactionInterpretation({ amount: 23 as unknown as string })],
    ['a confidence above one', transactionInterpretation({ confidence: 1.5 })],
    ['an unknown transaction type', transactionInterpretation({ type: 'REFUND' as never })],
    ['an unknown intent', questionInterpretation({ intent: 'RUN_SQL' as never })],
    ['a missing field', { kind: 'TRANSACTION', question: null, transaction: { amount: '23' } }],
  ])('rejects %s as an invalid response', async (_description, output) => {
    expect(await failureOf(output)).toBe('INVALID_RESPONSE');
  });

  it('passes provider failures through unchanged', async () => {
    const provider = new FakeAIProvider().willFailToInterpret('RATE_LIMITED');

    await expect(new MessageInterpreter(provider).interpret(REQUEST)).rejects.toMatchObject({
      category: 'RATE_LIMITED',
    });
  });
});
