import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { ProactiveCfoService, type EvaluationRun } from './proactive-cfo.service.js';
import { PROACTIVE_POLICY } from './proactive-policy.js';

const MILLISECONDS_PER_MINUTE = 60_000;

@Injectable()
export class ProactiveScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProactiveScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<EvaluationRun> | undefined;

  constructor(
    private readonly proactive: ProactiveCfoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.proactiveEvaluationEnabled) {
      return;
    }
    this.timer = setInterval(() => {
      void this.trigger(new Date());
    }, PROACTIVE_POLICY.evaluationIntervalInMinutes * MILLISECONDS_PER_MINUTE);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  async trigger(instant: Date): Promise<EvaluationRun> {
    if (this.running !== undefined) {
      return { status: 'SKIPPED' };
    }
    this.running = this.proactive.evaluateAll(instant).catch((error: unknown): EvaluationRun => {
      this.logger.error(
        `Proactive evaluation failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      return { status: 'SKIPPED' };
    });
    try {
      return await this.running;
    } finally {
      this.running = undefined;
    }
  }
}
