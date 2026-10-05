import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { InboundMessageDispatcher } from './inbound-message-dispatcher.js';
import { InboundMessageProcessor } from './inbound-message-processor.js';
import { WebhookEventsRepository } from './webhook-events.repository.js';
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
  ],
  exports: [InboundMessageDispatcher],
})
export class WhatsAppModule {}
