import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { localeOr, type Locale } from '../i18n/locale.js';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp-provider.js';

import type { WelcomeResult } from './welcome-result.js';

const TEMPLATE_LANGUAGES: Record<Locale, string> = { 'pt-BR': 'pt_BR', en: 'en' };

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

@Injectable()
export class MemberWelcomeService {
  private readonly logger = new Logger(MemberWelcomeService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly households: HouseholdsRepository,
  ) {}

  get isEnabled(): boolean {
    return this.config.welcomeTemplate !== null;
  }

  async welcome(householdId: string, memberId: string, address?: string): Promise<WelcomeResult> {
    const template = this.config.welcomeTemplate;
    if (template === null) {
      return 'DISABLED';
    }
    const [household, member, addresses] = await Promise.all([
      this.households.findHousehold(householdId),
      this.households.findMember(householdId, memberId),
      this.households.listWhatsAppAddresses(householdId, this.provider.name),
    ]);
    const to = address ?? addresses.filter((entry) => entry.memberId === memberId).at(-1)?.address;
    if (household === undefined || member === undefined || to === undefined) {
      return 'NO_NUMBER';
    }
    try {
      await this.provider.sendTemplate({
        to,
        name: template,
        language: TEMPLATE_LANGUAGES[localeOr(household.locale)],
        parameters: [firstNameOf(member.name)],
      });
      this.logger.log(`event=welcome-sent provider=${this.provider.name}`);
      return 'SENT';
    } catch {
      this.logger.warn(`event=welcome-failed provider=${this.provider.name}`);
      return 'FAILED';
    }
  }
}
