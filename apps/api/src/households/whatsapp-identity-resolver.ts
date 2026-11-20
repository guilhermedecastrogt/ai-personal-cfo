import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { localeOr } from '../i18n/locale.js';
import { households, members, whatsappIdentities } from './households.schema.js';
import type { RequestContext } from './request-context.js';
import { equivalentAddresses } from './whatsapp-address.js';

@Injectable()
export class WhatsAppIdentityResolver {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async resolve(provider: string, externalUserId: string): Promise<RequestContext | undefined> {
    const candidates = await this.database
      .select({
        address: whatsappIdentities.externalUserId,
        householdId: members.householdId,
        memberId: members.id,
        memberName: members.name,
        locale: households.locale,
      })
      .from(whatsappIdentities)
      .innerJoin(members, eq(members.id, whatsappIdentities.memberId))
      .innerJoin(households, eq(households.id, members.householdId))
      .where(
        and(
          eq(whatsappIdentities.provider, provider),
          inArray(whatsappIdentities.externalUserId, [...equivalentAddresses(externalUserId)]),
        ),
      );
    const sender =
      candidates.find((candidate) => candidate.address === externalUserId) ?? candidates[0];
    return sender === undefined
      ? undefined
      : {
          householdId: sender.householdId,
          memberId: sender.memberId,
          memberName: sender.memberName,
          locale: localeOr(sender.locale),
          channel: 'whatsapp',
        };
  }
}
