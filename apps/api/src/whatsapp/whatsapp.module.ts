import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { InboundMessageDispatcher } from './inbound-message-dispatcher.js';
import { InboundMessageProcessor } from './inbound-message-processor.js';
import { MemberWelcomeService } from './member-welcome.service.js';
import { WebhookEventsRepository } from './webhook-events.repository.js';
import { WhatsAppIdentityService } from './whatsapp-identity.service.js';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller.js';
import { WhatsAppWebhookService } from './whatsapp-webhook.service.js';

@Module({
  imports: [ConversationModule, HouseholdsModule],
  controllers: [WhatsAppWebhookController],
  providers: [
    WebhookEventsRepository,
    InboundMessageProcessor,
    InboundMessageDispatcher,
    WhatsAppWebhookService,
    WhatsAppIdentityService,
    MemberWelcomeService,
  ],
  exports: [InboundMessageDispatcher, WhatsAppIdentityService, MemberWelcomeService],
})
export class WhatsAppModule {}
