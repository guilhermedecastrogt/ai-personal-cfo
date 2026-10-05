import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from './database.js';

@Injectable()
export class DatabasePoolLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabasePoolLifecycle.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    this.pool.on('error', () => {
      this.logger.error('Idle database connection failed');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
