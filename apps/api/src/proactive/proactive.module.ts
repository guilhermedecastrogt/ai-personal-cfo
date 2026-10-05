import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CfoModule } from '../cfo/cfo.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { WhatsAppNotificationChannel } from '../whatsapp/whatsapp-notification-channel.js';
import { NOTIFICATION_CHANNEL } from './notification-channel.js';
import { NotificationComposer } from './notification-composer.js';
import { ProactiveCfoService } from './proactive-cfo.service.js';
import { ProactiveNotificationsRepository } from './proactive-notifications.repository.js';
import { ProactiveScheduler } from './proactive-scheduler.js';

@Module({
  imports: [AiModule, CfoModule, HouseholdsModule],
  providers: [
    ProactiveNotificationsRepository,
    NotificationComposer,
    WhatsAppNotificationChannel,
    { provide: NOTIFICATION_CHANNEL, useExisting: WhatsAppNotificationChannel },
    ProactiveCfoService,
    ProactiveScheduler,
  ],
  exports: [ProactiveCfoService, ProactiveScheduler],
})
export class ProactiveModule {}
