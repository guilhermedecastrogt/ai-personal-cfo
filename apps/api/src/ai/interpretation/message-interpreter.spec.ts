import { AIProviderError } from '../ai-provider.js';
import {
  CORRECTION_INTERPRETATION,
  EMPTY_CONVERSATION,
  FakeAIProvider,
  UNCLEAR_INTERPRETATION,
  completionOf,
  contributionInterpretation,
  correctionInterpretation,
  OTHER_INTERPRETATION,
  questionInterpretation,
  transactionInterpretation,
  transactionsInterpretation,
} from '../testing/fake-ai-provider.fixture.js';
import { MessageInterpreter } from './message-interpreter.js';

const REQUEST = {
  message: 'I spent 23 at Lidl',
  conversation: EMPTY_CONVERSATION,
  senderName: 'Member A',
  memberNames: ['Member A'],
  accountNames: ['Joint Account'],
  categories: [],
  goalNames: [],
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
      transactions: [{ type: 'EXPENSE', amount: '23', merchant: 'Lidl' }],
    });
  });

  it('returns every transaction of a message in the order written', async () => {
    expect(
      await interpret(
        transactionsInterpretation({ merchant: 'Café', amount: '10.65' }, { merchant: 'Lidl' }),
      ),
    ).toMatchObject({
      kind: 'TRANSACTION',
      transactions: [{ merchant: 'Café' }, { merchant: 'Lidl' }],
    });
  });

  it('reads a transaction kind without any transaction as unclear', async () => {
    expect(
      await interpret({
        kind: 'TRANSACTION',
        transactions: [],
        question: null,
        correction: null,
        contribution: null,
        completesPendingTransaction: false,
      }),
    ).toEqual({ kind: 'UNCLEAR' });
  });

  it('refuses more transactions than one message may carry', async () => {
    const six = transactionsInterpretation({}, {}, {}, {}, {}, {});

    expect(await failureOf(six)).toBe('INVALID_RESPONSE');
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

  it('returns UNCLEAR without a candidate or a question', async () => {
    expect(await interpret(UNCLEAR_INTERPRETATION)).toEqual({ kind: 'UNCLEAR' });
  });

  it('returns a correction with its target and changes', async () => {
    expect(
      await interpret(correctionInterpretation('EDIT', { merchant: 'Lidl' }, { amount: '28' })),
    ).toMatchObject({
      kind: 'CORRECTION',
      correction: {
        action: 'EDIT',
        target: { merchant: 'Lidl', ordinal: null },
        changes: { amount: '28', merchant: null },
      },
    });
  });

  it('returns a goal contribution', async () => {
    expect(
      await interpret(contributionInterpretation('Viagem Malta', { fromRecorded: true })),
    ).toMatchObject({
      kind: 'GOAL_CONTRIBUTION',
      contribution: { goal: 'Viagem Malta', fromRecorded: true },
    });
  });

  it('reads a correction that says nothing about what to change as unclear', async () => {
    expect(await interpret(CORRECTION_INTERPRETATION)).toEqual({ kind: 'UNCLEAR' });
  });

  it('says whether a transaction completes the pending one', async () => {
    expect(await interpret(completionOf({ category: 'Groceries' }))).toMatchObject({
      kind: 'TRANSACTION',
      completesPending: true,
      transactions: [{ category: 'Groceries', amount: null }],
    });
    expect(await interpret(transactionInterpretation())).toMatchObject({ completesPending: false });
  });

  it('carries the slots a follow-up question inherits', async () => {
    const output = questionInterpretation({ inheritFromPrevious: ['INTENT', 'CATEGORY'] });

    expect(await interpret(output)).toMatchObject({
      question: { inheritFromPrevious: ['INTENT', 'CATEGORY'] },
    });
  });

  it('rejects a follow-up that names a slot that does not exist', async () => {
    const output = questionInterpretation({ inheritFromPrevious: ['HOUSEHOLD'] as never });

    expect(await failureOf(output)).toBe('INVALID_RESPONSE');
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
