import { setTimeout as delay } from 'node:timers/promises';
import { InboundMessageDispatcher } from './inbound-message-dispatcher.js';
import type { InboundMessageProcessor } from './inbound-message-processor.js';
import type { InboundMessage } from './whatsapp-provider.js';

const RECEIVED_AT = new Date('2026-10-20T12:00:00Z');

function message(sender: string, messageId: string): InboundMessage {
  return {
    eventId: `event:${messageId}`,
    deliveryId: undefined,
    messageId,
    sender,
    sentAt: undefined,
    content: { kind: 'TEXT', text: messageId },
  };
}

class RecordingProcessor {
  readonly log: string[] = [];
  active = 0;
  mostActiveAtOnce = 0;

  async process(inbound: InboundMessage): Promise<void> {
    this.active += 1;
    this.mostActiveAtOnce = Math.max(this.mostActiveAtOnce, this.active);
    this.log.push(`start ${inbound.messageId}`);
    await delay(inbound.messageId.startsWith('slow') ? 30 : 1);
    this.log.push(`end ${inbound.messageId}`);
    this.active -= 1;
  }
}

function dispatcherWith(processor: RecordingProcessor): InboundMessageDispatcher {
  return new InboundMessageDispatcher(processor as unknown as InboundMessageProcessor);
}

describe('InboundMessageDispatcher', () => {
  it('processes the messages of one sender one at a time, in order', async () => {
    const processor = new RecordingProcessor();
    const dispatcher = dispatcherWith(processor);

    dispatcher.dispatch(message('sender-a', 'slow-1'), RECEIVED_AT);
    dispatcher.dispatch(message('sender-a', 'fast-2'), RECEIVED_AT);
    dispatcher.dispatch(message('sender-a', 'fast-3'), RECEIVED_AT);
    await dispatcher.whenIdle();

    expect(processor.log).toEqual([
      'start slow-1',
      'end slow-1',
      'start fast-2',
      'end fast-2',
      'start fast-3',
      'end fast-3',
    ]);
    expect(processor.mostActiveAtOnce).toBe(1);
  });

  it('processes different senders at the same time', async () => {
    const processor = new RecordingProcessor();
    const dispatcher = dispatcherWith(processor);

    dispatcher.dispatch(message('sender-a', 'slow-a'), RECEIVED_AT);
    dispatcher.dispatch(message('sender-b', 'slow-b'), RECEIVED_AT);
    dispatcher.dispatch(message('sender-c', 'slow-c'), RECEIVED_AT);
    await dispatcher.whenIdle();

    expect(processor.mostActiveAtOnce).toBe(3);
  });

  it('returns immediately and lets processing continue in the background', async () => {
    const processor = new RecordingProcessor();
    const dispatcher = dispatcherWith(processor);

    dispatcher.dispatch(message('sender-a', 'slow-1'), RECEIVED_AT);
    const logAtDispatch = [...processor.log];
    await dispatcher.whenIdle();

    expect(logAtDispatch).toEqual([]);
    expect(processor.log).toEqual(['start slow-1', 'end slow-1']);
  });

  it('finishes the work in flight before the application shuts down', async () => {
    const processor = new RecordingProcessor();
    const dispatcher = dispatcherWith(processor);
    dispatcher.dispatch(message('sender-a', 'slow-1'), RECEIVED_AT);

    await dispatcher.onApplicationShutdown();

    expect(processor.log).toEqual(['start slow-1', 'end slow-1']);
  });

  it('is idle when nothing was dispatched', async () => {
    await expect(dispatcherWith(new RecordingProcessor()).whenIdle()).resolves.toBeUndefined();
  });
});
