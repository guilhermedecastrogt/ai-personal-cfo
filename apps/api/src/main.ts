import 'reflect-metadata';
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
  await app.listen(config.port);
}

void bootstrap();
