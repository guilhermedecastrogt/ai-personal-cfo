import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseHealth } from '../database/database-health.js';

export interface LivenessResponse {
  readonly status: 'ok';
}

export interface ReadinessResponse {
  readonly status: 'ready';
}

@Controller()
export class HealthController {
  constructor(private readonly databaseHealth: DatabaseHealth) {}

  @Get('health')
  health(): LivenessResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    if (!(await this.databaseHealth.isReachable())) {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    return { status: 'ready' };
  }
}
