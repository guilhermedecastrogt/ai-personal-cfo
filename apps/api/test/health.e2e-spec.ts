import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config.js';
import { DatabaseHealth } from '../src/database/database-health.js';

const TEST_CONFIG: AppConfig = {
  environment: 'test',
  port: 0,
  logLevel: 'error',
  databaseUrl: 'postgres://unused:unused@localhost:5432/unused',
  openaiApiKey: 'unused',
  openaiModel: 'unused',
  aiConfidenceThreshold: 0.8,
  kapsoApiKey: 'unused',
  kapsoWebhookSecret: 'unused',
  kapsoPhoneNumberId: '000000000000000',
  kapsoApiBaseUrl: 'https://api.kapso.invalid/meta/whatsapp/v24.0',
  proactiveEvaluationEnabled: false,
  proactiveAiMessages: false,
};

class StubDatabaseHealth {
  reachable = true;

  isReachable(): Promise<boolean> {
    return Promise.resolve(this.reachable);
  }
}

describe('health endpoints', () => {
  let app: INestApplication<Server>;
  let databaseHealth: StubDatabaseHealth;

  beforeEach(async () => {
    databaseHealth = new StubDatabaseHealth();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(TEST_CONFIG)
      .overrideProvider(DatabaseHealth)
      .useValue(databaseHealth)
      .compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports liveness without consulting the database', async () => {
    databaseHealth.reachable = false;

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports ready when the database is reachable', async () => {
    const response = await request(app.getHttpServer()).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('reports unavailable when the database is not reachable', async () => {
    databaseHealth.reachable = false;

    const response = await request(app.getHttpServer()).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
  });
});
