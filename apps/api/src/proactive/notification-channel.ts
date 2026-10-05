export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

export interface NotificationRecipient {
  readonly memberId: string;
  readonly memberName: string;
}

export interface OutboundNotification {
  readonly householdId: string;
  readonly memberId: string;
  readonly text: string;
}

export interface NotificationChannel {
  readonly name: string;
  recipients(householdId: string): Promise<NotificationRecipient[]>;
  deliver(notification: OutboundNotification): Promise<void>;
}

export type DeliveryProblem = 'UNKNOWN_RECIPIENT' | 'CHANNEL_FAILED';

export class NotificationDeliveryError extends Error {
  constructor(readonly problem: DeliveryProblem) {
    super(`Notification could not be delivered: ${problem}`);
    this.name = NotificationDeliveryError.name;
  }
}
