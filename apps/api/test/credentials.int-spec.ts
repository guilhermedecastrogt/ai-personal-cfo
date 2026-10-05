import type { Server } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import { FakeAIProvider } from '../src/ai/testing/fake-ai-provider.fixture.js';
import { AppModule } from '../src/app.module.js';
import { memberCredentials } from '../src/auth/auth.schema.js';
import { AuthService } from '../src/auth/auth.service.js';
import { APP_CONFIG } from '../src/config/app-config.js';
import { SECURITY_POLICY_TOKEN } from '../src/security/security-policy.js';
import { RELAXED_SECURITY_POLICY, TEST_CONFIG } from './support/assistant-harness.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const PASSWORD = 'a long passphrase 42';

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

describe('email and password sign-in', () => {
  let testDatabase: TestDatabase;
  let app: INestApplication<Server>;
  let auth: AuthService;
  let sequence = 0;

  async function post(path: string, body: object): Promise<Reply> {
    const response = await request(app.getHttpServer()).post(path).send(body);
    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  async function sessionWorks(token: unknown): Promise<boolean> {
    const response = await request(app.getHttpServer())
      .get('/dashboard/session')
      .set('Authorization', `Bearer ${String(token)}`);
    return response.status === 200;
  }

  async function member(email?: string): Promise<{
    fixture: HouseholdFixture;
    code: string;
    email: string;
  }> {
    sequence += 1;
    const fixture = await createHouseholdFixture(
      testDatabase.database,
      `Credentials ${String(sequence)}`,
      2,
    );
    const address = email ?? `member${String(sequence)}@example.com`;
    await auth.registerEmail(fixture.household.id, memberAt(fixture, 0).id, address);
    const code = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);
    return { fixture, code, email: address };
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    testDatabase = await createTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue({ ...TEST_CONFIG, databaseUrl: testDatabase.url })
      .overrideProvider(AI_PROVIDER)
      .useValue(new FakeAIProvider())
      .overrideProvider(SECURITY_POLICY_TOKEN)
      .useValue(RELAXED_SECURITY_POLICY)
      .compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>({ rawBody: true });
    await app.init();
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
    await testDatabase.destroy();
  });

  it('sets a password with the access code once, then signs in with email and password', async () => {
    const { code, email, fixture } = await member();

    const setup = await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });
    const again = await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });
    const withCode = await post('/auth/sessions', { accessCode: code });
    const signedIn = await post('/auth/sessions', { email, password: PASSWORD });

    expect(setup.status).toBe(201);
    expect(setup.body.member).toBe(memberAt(fixture, 0).name);
    expect(await sessionWorks(setup.body.token)).toBe(true);
    expect(again.status).toBe(401);
    expect(withCode.status).toBe(401);
    expect(signedIn.status).toBe(201);
    expect(await sessionWorks(signedIn.body.token)).toBe(true);
  });

  it('ignores case and surrounding spaces in the email', async () => {
    const { code, email } = await member('Mixed.Case@Example.com');

    await post('/auth/credentials', { accessCode: code, email: ` ${email} `, password: PASSWORD });

    expect(
      (await post('/auth/sessions', { email: 'mixed.case@example.com', password: PASSWORD }))
        .status,
    ).toBe(201);
    expect(
      (await post('/auth/sessions', { email: 'MIXED.CASE@EXAMPLE.COM', password: PASSWORD }))
        .status,
    ).toBe(201);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { code, email } = await member();
    await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });

    const wrong = await post('/auth/sessions', { email, password: 'not the password' });
    const unknown = await post('/auth/sessions', {
      email: 'nobody@example.com',
      password: PASSWORD,
    });
    const empty = await post('/auth/sessions', { email, password: '' });

    expect([wrong.status, unknown.status, empty.status]).toEqual([401, 401, 401]);
    expect(wrong.body).toEqual(unknown.body);
    expect(JSON.stringify(wrong.body)).not.toMatch(/password|email|exist/i);
  });

  it('refuses an email other than the one registered for the member, and keeps the code', async () => {
    const { code, email } = await member();

    const other = await post('/auth/credentials', {
      accessCode: code,
      email: 'someone.else@example.com',
      password: PASSWORD,
    });
    const right = await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });

    expect(other.status).toBe(401);
    expect(right.status).toBe(201);
  });

  it('refuses an email already used by another member', async () => {
    const first = await member();
    await post('/auth/credentials', {
      accessCode: first.code,
      email: first.email,
      password: PASSWORD,
    });
    sequence += 1;
    const fixture = await createHouseholdFixture(testDatabase.database, 'No Email', 1);
    const code = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);

    const taken = await post('/auth/credentials', {
      accessCode: code,
      email: first.email,
      password: PASSWORD,
    });

    expect(taken.status).toBe(401);
    expect(
      (await post('/auth/sessions', { email: first.email, password: PASSWORD })).body.member,
    ).toBe(memberAt(first.fixture, 0).name);
  });

  it('lets a member without a registered email choose one', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Chooses Email', 1);
    const code = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);

    const setup = await post('/auth/credentials', {
      accessCode: code,
      email: 'chosen@example.com',
      password: PASSWORD,
    });

    expect(setup.status).toBe(201);
    expect(
      (await post('/auth/sessions', { email: 'chosen@example.com', password: PASSWORD })).status,
    ).toBe(201);
  });

  it('refuses a short password without using up the code', async () => {
    const { code, email } = await member();

    const weak = await post('/auth/credentials', { accessCode: code, email, password: 'short' });
    const strong = await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });

    expect(weak.status).toBe(422);
    expect(weak.body).toEqual({ code: 'WEAK_PASSWORD' });
    expect(strong.status).toBe(201);
  });

  it('stores only a scrypt hash of the password', async () => {
    const { code, email, fixture } = await member();
    await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });

    const [stored] = await testDatabase.database
      .select()
      .from(memberCredentials)
      .where(eq(memberCredentials.memberId, memberAt(fixture, 0).id));

    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(stored)).not.toContain(PASSWORD);
  });

  it('resets the password with a new code, ending the old password and sessions', async () => {
    const { code, email, fixture } = await member();
    const first = await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });
    const newCode = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);

    const reset = await post('/auth/credentials', {
      accessCode: newCode,
      email,
      password: 'another long passphrase',
    });

    expect(reset.status).toBe(201);
    expect(await sessionWorks(first.body.token)).toBe(false);
    expect((await post('/auth/sessions', { email, password: PASSWORD })).status).toBe(401);
    expect(
      (await post('/auth/sessions', { email, password: 'another long passphrase' })).status,
    ).toBe(201);
  });

  it('removes the password when access is revoked', async () => {
    const { code, email, fixture } = await member();
    await post('/auth/credentials', { accessCode: code, email, password: PASSWORD });

    await auth.revokeAccess(fixture.household.id, memberAt(fixture, 0).id);

    expect((await post('/auth/sessions', { email, password: PASSWORD })).status).toBe(401);
  });

  it.each([
    ['no fields', {}],
    ['an email that is not an address', { email: 'not-an-email', password: PASSWORD }],
    ['a password that is not text', { email: 'a@example.com', password: { $ne: null } }],
    ['an overlong password', { email: 'a@example.com', password: 'x'.repeat(5000) }],
  ])('refuses a sign-in with %s', async (_label, body) => {
    expect((await post('/auth/sessions', body)).status).toBe(401);
  });
});
