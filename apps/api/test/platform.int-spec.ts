import type { Server } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import { FakeAIProvider } from '../src/ai/testing/fake-ai-provider.fixture.js';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { APP_CONFIG } from '../src/config/app-config.js';
import { sessionSchema } from '../src/dashboard/dashboard.contracts.js';
import { households, members, whatsappIdentities } from '../src/households/households.schema.js';
import { PlatformAdminsRepository } from '../src/platform/platform-admins.repository.js';
import {
  householdDetailSchema,
  householdsOverviewSchema,
  invitationSchema,
} from '../src/platform/platform.contracts.js';
import { platformActions, platformAdmins } from '../src/platform/platform.schema.js';
import { SECURITY_POLICY_TOKEN } from '../src/security/security-policy.js';
import { FakeWhatsAppProvider } from '../src/whatsapp/testing/fake-whatsapp-provider.fixture.js';
import { WHATSAPP_PROVIDER } from '../src/whatsapp/whatsapp-provider.js';
import { RELAXED_SECURITY_POLICY, TEST_CONFIG } from './support/assistant-harness.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const MISSING_KEY = '7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b';

describe('platform administration', () => {
  let testDatabase: TestDatabase;
  let app: INestApplication<Server>;
  let auth: AuthService;
  let operator: HouseholdFixture;
  let tenant: HouseholdFixture;
  let adminToken: string;
  let memberToken: string;
  const whatsapp = new FakeWhatsAppProvider();

  async function tokenFor(householdId: string, memberId: string): Promise<string> {
    const code = await auth.issueAccessCode(householdId, memberId);
    return signIn(code);
  }

  async function signIn(code: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/sessions')
      .send({ accessCode: code });
    return (response.body as { token: string }).token;
  }

  interface Client {
    readonly get: (path: string) => request.Test;
    readonly post: (path: string, body?: object) => request.Test;
    readonly patch: (path: string, body: object) => request.Test;
    readonly delete: (path: string) => request.Test;
  }

  function as(token: string): Client {
    const server = app.getHttpServer();
    return {
      get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${token}`),
      post: (path: string, body?: object) =>
        request(server).post(path).set('Authorization', `Bearer ${token}`).send(body),
      patch: (path: string, body: object) =>
        request(server).patch(path).set('Authorization', `Bearer ${token}`).send(body),
      delete: (path: string) =>
        request(server).delete(path).set('Authorization', `Bearer ${token}`),
    };
  }

  async function actions(): Promise<(typeof platformActions.$inferSelect)[]> {
    return testDatabase.database.select().from(platformActions);
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    testDatabase = await createTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue({ ...TEST_CONFIG, databaseUrl: testDatabase.url, welcomeTemplate: 'boas_vindas' })
      .overrideProvider(WHATSAPP_PROVIDER)
      .useValue(whatsapp)
      .overrideProvider(AI_PROVIDER)
      .useValue(new FakeAIProvider())
      .overrideProvider(SECURITY_POLICY_TOKEN)
      .useValue(RELAXED_SECURITY_POLICY)
      .compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>({ rawBody: true });
    await app.init();
    auth = app.get(AuthService);
    operator = await createHouseholdFixture(testDatabase.database, 'Operator', 1);
    tenant = await createHouseholdFixture(testDatabase.database, 'Tenant', 2);
    await app
      .get(PlatformAdminsRepository)
      .grant(operator.household.id, memberAt(operator, 0).id, null);
    adminToken = await tokenFor(operator.household.id, memberAt(operator, 0).id);
    memberToken = await tokenFor(tenant.household.id, memberAt(tenant, 0).id);
  });

  afterAll(async () => {
    await app.close();
    await testDatabase.destroy();
  });

  it('refuses anyone who is not a platform admin, and anyone without a session', async () => {
    expect((await as(memberToken).get('/platform/households')).status).toBe(403);
    expect((await as(memberToken).post('/platform/households', { name: 'X' })).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/platform/households')).status).toBe(401);
  });

  it('tells the dashboard who may open the administration', async () => {
    const admin = sessionSchema.parse((await as(adminToken).get('/dashboard/session')).body);
    const member = sessionSchema.parse((await as(memberToken).get('/dashboard/session')).body);

    expect(admin.isPlatformAdmin).toBe(true);
    expect(member.isPlatformAdmin).toBe(false);
  });

  it('lists every household with its size, without any financial figure', async () => {
    const response = await as(adminToken).get('/platform/households');
    const overview = householdsOverviewSchema.parse(response.body);

    expect(response.status).toBe(200);
    expect(overview.households.map((household) => household.name)).toEqual(
      expect.arrayContaining(['Operator', 'Tenant']),
    );
    expect(overview.households.find((household) => household.name === 'Tenant')).toMatchObject({
      memberCount: 2,
      adminCount: 0,
      isYours: false,
    });
    expect(overview.households.find((household) => household.name === 'Operator')).toMatchObject({
      adminCount: 1,
      isYours: true,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/Minor|balance|amount|Joint Account/i);
  });

  it('creates a household with its first member, and records who did it', async () => {
    const created = await as(adminToken).post('/platform/households', {
      name: 'Família Nova',
      currency: 'brl',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      firstMember: 'Pessoa Um',
    });
    const key = (created.body as { key: string }).key;
    const detail = householdDetailSchema.parse(
      (await as(adminToken).get(`/platform/households/${key}`)).body,
    );

    expect(created.status).toBe(201);
    expect(detail).toMatchObject({
      name: 'Família Nova',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      members: [{ name: 'Pessoa Um', email: null, hasPassword: false, isYou: false }],
    });
    expect(await actions()).toContainEqual(
      expect.objectContaining({
        actorMemberId: memberAt(operator, 0).id,
        action: 'HOUSEHOLD_CREATED',
        householdId: key,
      }),
    );
  });

  it.each([
    [{}, [{ field: 'name', code: 'REQUIRED' }]],
    [
      { name: 'X', currency: 'ZZZ', timezone: 'Europe/Dublin', locale: 'en', firstMember: 'A' },
      [{ field: 'currency', code: 'UNKNOWN' }],
    ],
    [
      { name: 'X', currency: 'EUR', timezone: 'Mars/Base', locale: 'en', firstMember: 'A' },
      [{ field: 'timezone', code: 'UNKNOWN' }],
    ],
    [
      { name: 'X', currency: 'EUR', timezone: 'Europe/Dublin', locale: 'fr', firstMember: 'A' },
      [{ field: 'locale', code: 'INVALID' }],
    ],
  ])('refuses a household it cannot create (%j)', async (body, errors) => {
    const before = await testDatabase.database.$count(households);

    const response = await as(adminToken).post('/platform/households', body);

    expect(response.status).toBe(422);
    expect((response.body as { errors: unknown[] }).errors).toEqual(expect.arrayContaining(errors));
    expect(await testDatabase.database.$count(households)).toBe(before);
  });

  it('changes name, time zone and language, but never the currency', async () => {
    const path = `/platform/households/${tenant.household.id}`;

    const response = await as(adminToken).patch(path, {
      name: 'Tenant Renamed',
      timezone: 'Europe/Lisbon',
      locale: 'pt-BR',
      currency: 'BRL',
    });
    const [stored] = await testDatabase.database
      .select()
      .from(households)
      .where(eq(households.id, tenant.household.id));

    expect(response.status).toBe(204);
    expect(stored).toMatchObject({
      name: 'Tenant Renamed',
      timezone: 'Europe/Lisbon',
      locale: 'pt-BR',
      currency: 'EUR',
    });
    expect(
      (
        await as(adminToken).patch(`/platform/households/${MISSING_KEY}`, {
          name: 'X',
          timezone: 'Europe/Lisbon',
          locale: 'en',
        })
      ).status,
    ).toBe(404);
    expect((await as(adminToken).get('/platform/households/not-a-key')).status).toBe(404);
  });

  it('adds a member, registers an email and issues an invitation that signs in to that household', async () => {
    const base = `/platform/households/${tenant.household.id}`;
    const added = await as(adminToken).post(`${base}/members`, { name: 'Tenant Member 3' });
    const memberKey = (added.body as { key: string }).key;

    const email = await as(adminToken).patch(`${base}/members/${memberKey}/email`, {
      email: ' Third@Example.com ',
    });
    const duplicate = await as(adminToken).patch(
      `${base}/members/${memberAt(tenant, 0).id}/email`,
      { email: 'third@example.com' },
    );
    const invitation = invitationSchema.parse(
      (await as(adminToken).post(`${base}/members/${memberKey}/invitation`)).body,
    );
    const invitedToken = await signIn(invitation.code);
    const session = sessionSchema.parse((await as(invitedToken).get('/dashboard/session')).body);
    const detail = householdDetailSchema.parse((await as(adminToken).get(base)).body);

    expect(added.status).toBe(201);
    expect(email.status).toBe(204);
    expect(duplicate.status).toBe(422);
    expect(duplicate.body).toEqual({ errors: [{ field: 'email', code: 'DUPLICATE' }] });
    expect(invitation).toMatchObject({ member: 'Tenant Member 3', email: 'third@example.com' });
    expect(session).toMatchObject({ member: 'Tenant Member 3', isPlatformAdmin: false });
    expect(detail.members.find((member) => member.key === memberKey)).toMatchObject({
      email: 'third@example.com',
      hasInvitation: true,
    });
  });

  it('revokes a member’s access, ending their sessions', async () => {
    const memberId = memberAt(tenant, 1).id;
    const token = await tokenFor(tenant.household.id, memberId);

    const response = await as(adminToken).delete(
      `/platform/households/${tenant.household.id}/members/${memberId}/access`,
    );

    expect(response.status).toBe(204);
    expect((await as(token).get('/dashboard/session')).status).toBe(401);
    expect(
      (
        await as(adminToken).delete(
          `/platform/households/${operator.household.id}/members/${memberId}/access`,
        )
      ).status,
    ).toBe(404);
  });

  it('registers and removes WhatsApp numbers only within the household named', async () => {
    const base = `/platform/households/${tenant.household.id}`;
    const memberId = memberAt(tenant, 0).id;

    const added = await as(adminToken).post(`${base}/members/${memberId}/whatsapp`, {
      phoneNumber: '+5511999990001',
    });
    const identityKey = (added.body as { key: string }).key;
    const duplicate = await as(adminToken).post(`${base}/members/${memberId}/whatsapp`, {
      phoneNumber: '+5511999990001',
    });
    const malformed = await as(adminToken).post(`${base}/members/${memberId}/whatsapp`, {
      phoneNumber: '11 99999-0001',
    });
    const elsewhere = await as(adminToken).post(
      `/platform/households/${operator.household.id}/members/${memberId}/whatsapp`,
      { phoneNumber: '+5511999990002' },
    );
    const [stored] = await testDatabase.database
      .select()
      .from(whatsappIdentities)
      .where(eq(whatsappIdentities.id, identityKey));
    const wrongHousehold = await as(adminToken).delete(
      `/platform/households/${operator.household.id}/whatsapp/${identityKey}`,
    );
    const removed = await as(adminToken).delete(`${base}/whatsapp/${identityKey}`);

    expect(added.status).toBe(201);
    expect(stored).toMatchObject({ externalUserId: '5511999990001', memberId });
    expect(duplicate.status).toBe(422);
    expect(malformed.status).toBe(422);
    expect(elsewhere.status).toBe(404);
    expect(wrongHousehold.status).toBe(404);
    expect(removed.status).toBe(204);
    expect(
      await testDatabase.database.$count(
        whatsappIdentities,
        eq(whatsappIdentities.id, identityKey),
      ),
    ).toBe(0);
  });

  it('grants and revokes platform admin, but never removes the last one', async () => {
    const operatorAdmin = `/platform/households/${operator.household.id}/members/${memberAt(operator, 0).id}/admin`;
    const tenantAdmin = `/platform/households/${tenant.household.id}/members/${memberAt(tenant, 0).id}/admin`;

    const lastOne = await as(adminToken).delete(operatorAdmin);
    const granted = await as(adminToken).post(tenantAdmin);
    const tenantSession = sessionSchema.parse(
      (await as(memberToken).get('/dashboard/session')).body,
    );
    const revoked = await as(adminToken).delete(tenantAdmin);
    const notAdmin = await as(adminToken).delete(tenantAdmin);

    expect(lastOne.status).toBe(422);
    expect(lastOne.body).toEqual({ errors: [{ field: 'form', code: 'NOT_ALLOWED' }] });
    expect(granted.status).toBe(204);
    expect(tenantSession.isPlatformAdmin).toBe(true);
    expect(revoked.status).toBe(204);
    expect(notAdmin.status).toBe(404);
    expect((await as(memberToken).get('/platform/households')).status).toBe(403);
    expect(await testDatabase.database.$count(platformAdmins)).toBe(1);
  });

  it('keeps an audit trail of identifiers only', async () => {
    const recorded = await actions();
    const names = (await testDatabase.database.select({ name: members.name }).from(members)).map(
      (row) => row.name,
    );

    expect(new Set(recorded.map((action) => action.action))).toEqual(
      new Set([
        'HOUSEHOLD_CREATED',
        'HOUSEHOLD_UPDATED',
        'MEMBER_ADDED',
        'EMAIL_REGISTERED',
        'INVITATION_ISSUED',
        'ACCESS_REVOKED',
        'WHATSAPP_IDENTITY_ADDED',
        'WHATSAPP_IDENTITY_REMOVED',
        'ADMIN_GRANTED',
        'ADMIN_REVOKED',
        'WELCOME_SENT',
      ]),
    );
    const text = JSON.stringify(recorded);
    expect(text).not.toMatch(/@|\+55|5511/);
    expect(names.some((name) => text.includes(name))).toBe(false);
  });

  describe('welcome on WhatsApp', () => {
    beforeEach(() => {
      whatsapp.templates.length = 0;
      whatsapp.willSend();
    });

    it('welcomes the first person of a new household as soon as the household exists', async () => {
      const response = await as(adminToken).post('/platform/households', {
        name: 'Família Boas Vindas',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        firstMember: 'Beatriz Souza',
        phoneNumber: '+5511988880001',
      });
      const detail = householdDetailSchema.parse(
        (await as(adminToken).get(`/platform/households/${(response.body as { key: string }).key}`))
          .body,
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ welcome: 'SENT' });
      expect(detail.members[0]?.whatsapp).toEqual([
        expect.objectContaining({ phoneNumber: '+5511988880001' }),
      ]);
      expect(whatsapp.templates).toEqual([
        {
          to: '5511988880001',
          name: 'boas_vindas',
          language: 'pt_BR',
          parameters: ['Beatriz'],
        },
      ]);
    });

    it('welcomes a person added with a number, in the household’s language', async () => {
      const response = await as(adminToken).post(
        `/platform/households/${operator.household.id}/members`,
        { name: 'Second Operator', phoneNumber: '+353850000777' },
      );

      expect(response.body).toMatchObject({ welcome: 'SENT' });
      expect(whatsapp.templates).toEqual([
        expect.objectContaining({
          to: '353850000777',
          language: 'en',
          parameters: ['Second'],
        }),
      ]);
    });

    it('adds a person without a number and welcomes nobody', async () => {
      const response = await as(adminToken).post(
        `/platform/households/${operator.household.id}/members`,
        { name: 'No Phone', phoneNumber: '' },
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ welcome: 'NOT_REQUESTED' });
      expect(whatsapp.templates).toEqual([]);
    });

    it('creates nothing when the number already belongs to someone', async () => {
      const before = await testDatabase.database.$count(households);

      const response = await as(adminToken).post('/platform/households', {
        name: 'Duplicate',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        firstMember: 'Someone',
        phoneNumber: '+5511988880001',
      });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ errors: [{ field: 'phoneNumber', code: 'DUPLICATE' }] });
      expect(await testDatabase.database.$count(households)).toBe(before);
      expect(whatsapp.templates).toEqual([]);
    });

    it('welcomes on a number added later, keeps the number when WhatsApp refuses, and resends on request', async () => {
      const memberId = memberAt(operator, 0).id;
      const base = `/platform/households/${operator.household.id}/members/${memberId}`;

      whatsapp.willFailToSend('REJECTED');
      const refused = await as(adminToken).post(`${base}/whatsapp`, {
        phoneNumber: '+353850000778',
      });
      whatsapp.willSend();
      const resent = await as(adminToken).post(`${base}/welcome`);
      const missing = await as(adminToken).post(
        `/platform/households/${operator.household.id}/members/${MISSING_KEY}/welcome`,
      );

      expect(refused.status).toBe(201);
      expect(refused.body).toMatchObject({ welcome: 'FAILED' });
      expect(resent.status).toBe(200);
      expect(resent.body).toEqual({ welcome: 'SENT' });
      expect(whatsapp.templates.map((template) => template.to)).toEqual(['353850000778']);
      expect(missing.status).toBe(404);
      expect((await as(memberToken).post(`${base}/welcome`)).status).toBe(403);
    });
  });
});
