import { EMPTY_CONVERSATION } from '../src/ai/testing/fake-ai-provider.fixture.js';
import { MessageInterpreter } from '../src/ai/interpretation/message-interpreter.js';
import { OpenAIProvider } from '../src/ai/openai/openai-provider.js';
import { findUnverifiedFigures } from '../src/ai/reply/reply-guard.js';
import { loadAppConfig } from '../src/config/app-config.js';

const LIVE_TIMEOUT_IN_MILLISECONDS = 60_000;

const REQUEST = {
  conversation: EMPTY_CONVERSATION,
  senderName: 'Member A',
  memberNames: ['Member A', 'Member B'],
  accountNames: ['Joint Account', 'Savings'],
  categories: [
    { name: 'Food', kind: 'EXPENSE' as const, parent: null },
    { name: 'Groceries', kind: 'EXPENSE' as const, parent: 'Food' },
    { name: 'Restaurants', kind: 'EXPENSE' as const, parent: 'Food' },
    { name: 'Salary', kind: 'INCOME' as const, parent: null },
  ],
};

describe('OpenAI, live', () => {
  const config = loadAppConfig(process.env);
  const provider = new OpenAIProvider({ apiKey: config.openaiApiKey, model: config.openaiModel });
  const interpreter = new MessageInterpreter(provider);

  it(
    'accepts the strict schema and extracts a stated expense',
    async () => {
      const interpretation = await interpreter.interpret({
        ...REQUEST,
        message: 'Gastei €23 no Lidl em compras de supermercado',
      });

      expect(interpretation).toMatchObject({
        kind: 'TRANSACTION',
        transaction: { type: 'EXPENSE', amount: '23', currency: 'EUR', category: 'Groceries' },
      });
    },
    LIVE_TIMEOUT_IN_MILLISECONDS,
  );

  it(
    'leaves unstated fields empty instead of inventing them',
    async () => {
      const interpretation = await interpreter.interpret({ ...REQUEST, message: 'Gastei 30' });

      expect(interpretation).toMatchObject({
        kind: 'TRANSACTION',
        transaction: { amount: '30', merchant: null, category: null, account: null },
      });
    },
    LIVE_TIMEOUT_IN_MILLISECONDS,
  );

  it(
    'returns an intent for a question instead of an answer',
    async () => {
      const interpretation = await interpreter.interpret({
        ...REQUEST,
        message: 'Quanto gastamos em restaurantes esse mês?',
      });

      expect(interpretation).toMatchObject({
        kind: 'QUESTION',
        question: {
          intent: 'SPENDING_BY_CATEGORY',
          category: 'Restaurants',
          memberScope: 'HOUSEHOLD',
        },
      });
    },
    LIVE_TIMEOUT_IN_MILLISECONDS,
  );

  it(
    'writes a reply that states only figures from the facts',
    async () => {
      const request = {
        situation: 'QUESTION_ANSWERED' as const,
        userMessage: 'Quanto gastamos em restaurantes esse mês?',
        senderName: 'Member A',
        facts: { result: { category: 'Restaurants', categoryTotal: '€246.00', usage: '82%' } },
      };

      const reply = await provider.composeReply(request);

      expect(findUnverifiedFigures(reply, request.facts, request.userMessage)).toEqual([]);
    },
    LIVE_TIMEOUT_IN_MILLISECONDS,
  );
});
