import { Inject, Injectable } from '@nestjs/common';
import { HouseholdsRepository } from '../households/households.repository.js';
import {
  NotificationDeliveryError,
  type NotificationChannel,
  type NotificationRecipient,
  type OutboundNotification,
} from '../proactive/notification-channel.js';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp-provider.js';

const CHANNEL_NAME = 'whatsapp';

@Injectable()
export class WhatsAppNotificationChannel implements NotificationChannel {
  readonly name = CHANNEL_NAME;

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly households: HouseholdsRepository,
  ) {}

  async recipients(householdId: string): Promise<NotificationRecipient[]> {
    const addresses = await this.households.listWhatsAppAddresses(householdId, this.provider.name);
    const byMember = new Map(addresses.map((entry) => [entry.memberId, entry.memberName]));
    return [...byMember].map(([memberId, memberName]) => ({ memberId, memberName }));
  }

  async deliver(notification: OutboundNotification): Promise<void> {
    const addresses = await this.households.listWhatsAppAddresses(
      notification.householdId,
      this.provider.name,
    );
    const address = addresses.find((entry) => entry.memberId === notification.memberId)?.address;
    if (address === undefined) {
      throw new NotificationDeliveryError('UNKNOWN_RECIPIENT');
    }
    try {
      await this.provider.sendText({ to: address, text: notification.text });
    } catch {
      throw new NotificationDeliveryError('CHANNEL_FAILED');
    }
  }
}
