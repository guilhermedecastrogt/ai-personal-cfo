import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ProactiveScheduler } from './proactive-scheduler.js';

const application = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

try {
  const run = await application.get(ProactiveScheduler).trigger(new Date());
  process.stdout.write(`${JSON.stringify(run)}\n`);
} finally {
  await application.close();
}
