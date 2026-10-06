import { FakeAIProvider } from '../testing/fake-ai-provider.fixture.js';
import { ReplyComposer } from './reply-composer.js';
import { Logger } from '@nestjs/common';

const REQUEST = {
  situation: 'QUESTION_ANSWERED',
  userMessage: 'How much did we spend?',
  senderName: 'Member A',
  facts: { intent: 'SPENDING_TOTAL', result: { householdTotal: '€625.00' } },
} as const;

describe('ReplyComposer', () => {
  it('removes long dashes from the model reply', async () => {
    const provider = new FakeAIProvider().willReply('Registado — €625.00 na categoria Groceries.');

    expect(await new ReplyComposer(provider).compose(REQUEST)).toBe(
      'Registado, €625.00 na categoria Groceries.',
    );
  });

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('drops an offer the system could not act on', async () => {
    const provider = new FakeAIProvider().willReply(
      'You spent €625.00 this month.\n\nWould you like me to break it down?',
    );

    expect(await new ReplyComposer(provider).compose(REQUEST)).toBe(
      'You spent €625.00 this month.',
    );
  });

  it('keeps the question when the reply exists to ask one', async () => {
    const provider = new FakeAIProvider().willReply('I understood €12.00. Which account was it?');

    expect(
      await new ReplyComposer(provider).compose({
        ...REQUEST,
        situation: 'CLARIFICATION_NEEDED',
        facts: { amount: '€12.00' },
      }),
    ).toBe('I understood €12.00. Which account was it?');
  });

  it('returns the reply when every figure in it comes from the facts', async () => {
    const provider = new FakeAIProvider().willReply('You spent €625.00 this month.');

    expect(await new ReplyComposer(provider).compose(REQUEST)).toBe(
      'You spent €625.00 this month.',
    );
  });

  it('gives the provider the facts and never asks it to compute', async () => {
    const provider = new FakeAIProvider();

    await new ReplyComposer(provider).compose(REQUEST);

    expect(provider.replyRequests).toEqual([REQUEST]);
  });

  it('replaces a reply that states a figure absent from the facts', async () => {
    const provider = new FakeAIProvider().willReply('You spent €999.00 this month.');

    const reply = await new ReplyComposer(provider).compose(REQUEST);

    expect(reply).not.toContain('999');
    expect(reply).toContain('€625.00');
  });

  it('replaces an empty reply', async () => {
    const provider = new FakeAIProvider().willReply('   ');

    expect(await new ReplyComposer(provider).compose(REQUEST)).toContain('€625.00');
  });

  it.each(['TIMEOUT', 'RATE_LIMITED', 'UNAVAILABLE', 'AUTHENTICATION'] as const)(
    'falls back to a deterministic reply when the provider fails with %s',
    async (failure) => {
      const provider = new FakeAIProvider().willFailToReply(failure);

      const reply = await new ReplyComposer(provider).compose(REQUEST);

      expect(reply).toBe(
        [
          'Here is what I found.',
          'intent: SPENDING_TOTAL',
          'result:',
          '  householdTotal: €625.00',
        ].join('\n'),
      );
    },
  );
});
