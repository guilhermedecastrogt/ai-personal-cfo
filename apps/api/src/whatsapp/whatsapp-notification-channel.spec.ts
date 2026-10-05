import type { HouseholdsRepository } from '../households/households.repository.js';
import { NotificationDeliveryError } from '../proactive/notification-channel.js';
import { FakeWhatsAppProvider } from './testing/fake-whatsapp-provider.fixture.js';
import { WhatsAppNotificationChannel } from './whatsapp-notification-channel.js';

const ADDRESSES = [
  { memberId: 'member-a', memberName: 'Member A', address: '15550000001' },
  { memberId: 'member-a', memberName: 'Member A', address: '15550000009' },
  { memberId: 'member-b', memberName: 'Member B', address: '15550000002' },
];

function channelWith(provider: FakeWhatsAppProvider): {
  channel: WhatsAppNotificationChannel;
  lookups: { householdId: string; provider: string }[];
} {
  const lookups: { householdId: string; provider: string }[] = [];
  const households = {
    listWhatsAppAddresses: (householdId: string, providerName: string) => {
      lookups.push({ householdId, provider: providerName });
      return Promise.resolve(householdId === 'household-1' ? ADDRESSES : []);
    },
  } as unknown as HouseholdsRepository;
  return { channel: new WhatsAppNotificationChannel(provider, households), lookups };
}

describe('WhatsAppNotificationChannel', () => {
  it('lists each reachable member of the household once', async () => {
    const { channel, lookups } = channelWith(new FakeWhatsAppProvider());

    expect(await channel.recipients('household-1')).toEqual([
      { memberId: 'member-a', memberName: 'Member A' },
      { memberId: 'member-b', memberName: 'Member B' },
    ]);
    expect(lookups).toEqual([{ householdId: 'household-1', provider: 'fake' }]);
  });

  it('sends through the WhatsApp provider to the address registered for the member', async () => {
    const provider = new FakeWhatsAppProvider();
    const { channel } = channelWith(provider);

    await channel.deliver({ householdId: 'household-1', memberId: 'member-b', text: 'A note' });

    expect(provider.sent).toEqual([{ to: '15550000002', text: 'A note' }]);
  });

  it('refuses a member who has no address in that household', async () => {
    const provider = new FakeWhatsAppProvider();
    const { channel } = channelWith(provider);

    await expect(
      channel.deliver({ householdId: 'household-2', memberId: 'member-b', text: 'A note' }),
    ).rejects.toMatchObject({ problem: 'UNKNOWN_RECIPIENT' });
    expect(provider.sent).toHaveLength(0);
  });

  it('reports a provider failure without exposing the provider error', async () => {
    const provider = new FakeWhatsAppProvider().willFailToSend('UNAVAILABLE');
    const { channel } = channelWith(provider);

    const failure = await channel
      .deliver({ householdId: 'household-1', memberId: 'member-a', text: 'A note' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NotificationDeliveryError);
    expect(failure).toMatchObject({ problem: 'CHANNEL_FAILED' });
  });
});
