import type { AppConfig } from '../config/app-config.js';
import type { EvaluationRun, ProactiveCfoService } from './proactive-cfo.service.js';
import { ProactiveScheduler } from './proactive-scheduler.js';

const COMPLETED: EvaluationRun = {
  status: 'COMPLETED',
  households: 1,
  failedHouseholds: 0,
  delivered: 0,
};

class ControlledEvaluation {
  calls = 0;
  private release: ((run: EvaluationRun) => void) | undefined;
  failure: Error | undefined;

  evaluateAll(): Promise<EvaluationRun> {
    this.calls += 1;
    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }

  finish(): void {
    this.release?.(COMPLETED);
  }
}

function schedulerWith(evaluation: ControlledEvaluation, enabled = false): ProactiveScheduler {
  return new ProactiveScheduler(
    evaluation as unknown as ProactiveCfoService,
    {
      proactiveEvaluationEnabled: enabled,
    } as AppConfig,
  );
}

describe('ProactiveScheduler', () => {
  const originalSetInterval = globalThis.setInterval;
  let ticks: (() => void)[] = [];

  beforeEach(() => {
    ticks = [];
    globalThis.setInterval = (tick: () => void): NodeJS.Timeout => {
      ticks.push(tick);
      const timer = originalSetInterval(() => undefined, 3_600_000);
      clearInterval(timer);
      return timer;
    };
  });

  afterEach(() => {
    globalThis.setInterval = originalSetInterval;
  });

  it('does not start a second evaluation while one is running', async () => {
    const evaluation = new ControlledEvaluation();
    const scheduler = schedulerWith(evaluation);

    const first = scheduler.trigger(new Date());
    const second = await scheduler.trigger(new Date());
    evaluation.finish();

    expect(second).toEqual({ status: 'SKIPPED' });
    expect(await first).toEqual(COMPLETED);
    expect(evaluation.calls).toBe(1);
  });

  it('runs again once the previous evaluation has finished', async () => {
    const evaluation = new ControlledEvaluation();
    const scheduler = schedulerWith(evaluation);

    const first = scheduler.trigger(new Date());
    evaluation.finish();
    await first;
    const second = scheduler.trigger(new Date());
    evaluation.finish();
    await second;

    expect(evaluation.calls).toBe(2);
  });

  it('survives a failed evaluation and can run again', async () => {
    const evaluation = new ControlledEvaluation();
    evaluation.failure = new Error('database unavailable');
    const scheduler = schedulerWith(evaluation);

    expect(await scheduler.trigger(new Date())).toEqual({ status: 'SKIPPED' });
    expect(await scheduler.trigger(new Date())).toEqual({ status: 'SKIPPED' });
    expect(evaluation.calls).toBe(2);
  });

  it('starts no timer unless proactive evaluation is enabled', () => {
    const scheduler = schedulerWith(new ControlledEvaluation(), false);

    scheduler.onModuleInit();

    expect(ticks).toHaveLength(0);
  });

  it('evaluates on each tick when enabled, without overlapping', async () => {
    const evaluation = new ControlledEvaluation();
    const scheduler = schedulerWith(evaluation, true);

    scheduler.onModuleInit();
    ticks[0]?.();
    ticks[0]?.();
    evaluation.finish();
    await scheduler.onModuleDestroy();

    expect(ticks).toHaveLength(1);
    expect(evaluation.calls).toBe(1);
  });
});
