import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { DatabaseHealth } from './database-health.js';
import { DatabasePoolLifecycle } from './database-pool-lifecycle.js';
import { DATABASE, DATABASE_POOL, type Database } from './database.js';

const CONNECTION_TIMEOUT_IN_MILLISECONDS = 5000;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Pool =>
        new Pool({
          connectionString: config.databaseUrl,
          connectionTimeoutMillis: CONNECTION_TIMEOUT_IN_MILLISECONDS,
        }),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool),
    },
    DatabasePoolLifecycle,
    DatabaseHealth,
  ],
  exports: [DATABASE, DatabaseHealth],
})
export class DatabaseModule {}
