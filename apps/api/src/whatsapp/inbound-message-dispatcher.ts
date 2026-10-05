import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { InboundMessageProcessor } from './inbound-message-processor.js';
import type { InboundMessage } from './whatsapp-provider.js';

@Injectable()
export class InboundMessageDispatcher implements OnApplicationShutdown {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly processor: InboundMessageProcessor) {}

  dispatch(message: InboundMessage, receivedAt: Date): void {
    const previous = this.queues.get(message.sender) ?? Promise.resolve();
    const next = previous.then(() => this.processor.process(message, receivedAt));
    this.queues.set(message.sender, next);
    void next.finally(() => {
      if (this.queues.get(message.sender) === next) {
        this.queues.delete(message.sender);
      }
    });
  }

  async whenIdle(): Promise<void> {
    while (this.queues.size > 0) {
      await Promise.allSettled([...this.queues.values()]);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.whenIdle();
  }
}
