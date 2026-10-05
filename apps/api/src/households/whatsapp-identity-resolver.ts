import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { members, whatsappIdentities } from './households.schema.js';
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
      })
      .from(whatsappIdentities)
      .innerJoin(members, eq(members.id, whatsappIdentities.memberId))
      .where(
        and(
          eq(whatsappIdentities.provider, provider),
          eq(whatsappIdentities.externalUserId, externalUserId),
        ),
      );
    return sender === undefined ? undefined : { ...sender, channel: 'whatsapp' };
  }
}
