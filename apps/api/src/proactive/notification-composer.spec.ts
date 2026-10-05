import { FakeAIProvider } from '../ai/testing/fake-ai-provider.fixture.js';
import type { AppConfig } from '../config/app-config.js';
import { NotificationComposer, plainMessage } from './notification-composer.js';
import { PROACTIVE_POLICY } from './proactive-policy.js';

const CONTENT = {
  type: 'BUDGET_EXCEEDED',
  severity: 'HIGH',
  period: '2026-10',
  title: 'Restaurants budget exceeded',
  body: '€240.00 of €200.00 spent (120%).',
};

function composerWith(
  provider: FakeAIProvider,
  proactiveAiMessages: boolean,
): NotificationComposer {
  return new NotificationComposer(provider, { proactiveAiMessages } as AppConfig);
}

describe('NotificationComposer', () => {
  it('writes the deterministic message without calling the model when AI wording is off', async () => {
    const provider = new FakeAIProvider();

    const message = await composerWith(provider, false).compose(CONTENT, 'Member A');

    expect(message).toBe('Restaurants budget exceeded\n€240.00 of €200.00 spent (120%).');
    expect(provider.replyRequests).toHaveLength(0);
  });

  it('uses the model wording when every figure in it comes from the facts', async () => {
    const provider = new FakeAIProvider().willReply(
      'The Restaurants budget is over: €240.00 of €200.00 spent.',
    );

    const message = await composerWith(provider, true).compose(CONTENT, 'Member A');

    expect(message).toBe('The Restaurants budget is over: €240.00 of €200.00 spent.');
  });

  it('removes long dashes from model wording', async () => {
    const provider = new FakeAIProvider().willReply(
      'Restaurants budget exceeded — €240.00 of €200.00 spent.',
    );

    const message = await composerWith(provider, true).compose(CONTENT, 'Member A');

    expect(message).toBe('Restaurants budget exceeded, €240.00 of €200.00 spent.');
  });

  it('gives the model only the notification facts', async () => {
    const provider = new FakeAIProvider().willReply('Restaurants budget exceeded.');

    await composerWith(provider, true).compose(CONTENT, 'Member A');

    expect(provider.replyRequests).toEqual([
      {
        situation: 'PROACTIVE_NOTIFICATION',
        userMessage: '',
        senderName: 'Member A',
        facts: {
          type: 'BUDGET_EXCEEDED',
          severity: 'HIGH',
          period: '2026-10',
          title: CONTENT.title,
          detail: CONTENT.body,
        },
      },
    ]);
  });

  it('falls back when the model introduces a figure that is not in the facts', async () => {
    const provider = new FakeAIProvider().willReply(
      'You are €40.00 over the Restaurants budget, cut €15 a week.',
    );

    expect(await composerWith(provider, true).compose(CONTENT, 'Member A')).toBe(
      plainMessage(CONTENT),
    );
  });

  it.each(['TIMEOUT', 'RATE_LIMITED', 'UNAVAILABLE', 'AUTHENTICATION'] as const)(
    'falls back when the model fails with %s',
    async (failure) => {
      const provider = new FakeAIProvider().willFailToReply(failure);

      expect(await composerWith(provider, true).compose(CONTENT, 'Member A')).toBe(
        plainMessage(CONTENT),
      );
    },
  );

  it('falls back when the model writes nothing or far too much', async () => {
    const empty = new FakeAIProvider().willReply('   ');
    const long = new FakeAIProvider().willReply(
      'word '.repeat(PROACTIVE_POLICY.maximumMessageLength),
    );

    expect(await composerWith(empty, true).compose(CONTENT, 'Member A')).toBe(
      plainMessage(CONTENT),
    );
    expect(await composerWith(long, true).compose(CONTENT, 'Member A')).toBe(plainMessage(CONTENT));
  });
});
