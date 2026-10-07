import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { WhatsAppModule } from '../whatsapp/whatsapp.module.js';
import { PlatformAccessService } from './platform-access.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformAdminsRepository } from './platform-admins.repository.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

@Module({
  imports: [AuthModule, HouseholdsModule, WhatsAppModule],
  controllers: [PlatformController],
  providers: [PlatformAdminsRepository, PlatformAccessService, PlatformAdminGuard, PlatformService],
  exports: [PlatformAccessService],
})
export class PlatformModule {}
