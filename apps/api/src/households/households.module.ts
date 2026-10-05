import { Module } from '@nestjs/common';
import { HouseholdsRepository } from './households.repository.js';
import { WhatsAppIdentityResolver } from './whatsapp-identity-resolver.js';

@Module({
  providers: [HouseholdsRepository, WhatsAppIdentityResolver],
  exports: [HouseholdsRepository, WhatsAppIdentityResolver],
})
export class HouseholdsModule {}
