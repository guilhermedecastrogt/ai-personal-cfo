import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { localeOr } from '../i18n/locale.js';
import { households, members, whatsappIdentities } from './households.schema.js';
import type { RequestContext } from './request-context.js';

@Injectable()
export class WhatsAppIdentityResolver {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async resolve(provider: string, externalUserId: string): Promise<RequestContext | undefined> {
    const [sender] = await this.database
      .select({
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
          eq(whatsappIdentities.externalUserId, externalUserId),
        ),
      );
    return sender === undefined
      ? undefined
      : { ...sender, locale: localeOr(sender.locale), channel: 'whatsapp' };
  }
}
