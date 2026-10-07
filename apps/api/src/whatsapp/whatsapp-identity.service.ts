import { Inject, Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../database/unique-violation.js';
import {
  HouseholdsRepository,
  MemberNotInHouseholdError,
  type WhatsAppIdentity,
} from '../households/households.repository.js';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp-provider.js';

export type IdentityRegistration =
  | { readonly status: 'REGISTERED'; readonly identity: WhatsAppIdentity }
  | { readonly status: 'UNKNOWN_MEMBER' }
  | { readonly status: 'ALREADY_REGISTERED' };

export function externalUserIdOf(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, '');
}

@Injectable()
export class WhatsAppIdentityService {
  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly households: HouseholdsRepository,
  ) {}

  async register(
    householdId: string,
    memberId: string,
    phoneNumber: string,
  ): Promise<IdentityRegistration> {
    try {
      const identity = await this.households.registerWhatsAppIdentity(householdId, {
        memberId,
        provider: this.provider.name,
        externalUserId: externalUserIdOf(phoneNumber),
        phoneNumber,
      });
      return { status: 'REGISTERED', identity };
    } catch (error) {
      if (error instanceof MemberNotInHouseholdError) {
        return { status: 'UNKNOWN_MEMBER' };
      }
      if (isUniqueViolation(error)) {
        return { status: 'ALREADY_REGISTERED' };
      }
      throw error;
    }
  }
}
