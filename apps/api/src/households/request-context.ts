export type Channel = 'whatsapp' | 'web';

export interface RequestContext {
  readonly householdId: string;
  readonly memberId: string;
  readonly memberName: string;
  readonly channel: Channel;
}
