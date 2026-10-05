import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { createLogger } from './logging/create-logger.js';
import { hardenHttp } from './security/http-hardening.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(createLogger(config));
  hardenHttp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(
    `event=started environment=${config.environment} port=${String(config.port)} node=${process.version}`,
  );
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      logger.log(`event=stopping signal=${signal}`);
    });
  }
}

void bootstrap();
