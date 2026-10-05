import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE, type Database } from './database.js';

@Injectable()
export class DatabaseHealth {
  private readonly logger = new Logger(DatabaseHealth.name);

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async isReachable(): Promise<boolean> {
    try {
      await this.database.execute(sql`select 1`);
      return true;
    } catch {
      this.logger.warn('Database is not reachable');
      return false;
    }
  }
}
