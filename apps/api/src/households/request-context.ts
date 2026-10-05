import type { Locale } from '../i18n/locale.js';

export type Channel = 'whatsapp' | 'web';

export interface RequestContext {
  readonly householdId: string;
  readonly memberId: string;
  readonly memberName: string;
  readonly channel: Channel;
  readonly locale?: Locale;
}
