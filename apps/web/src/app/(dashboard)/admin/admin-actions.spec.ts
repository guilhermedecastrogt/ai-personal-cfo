import { INITIAL_ADMIN_STATE } from '@/lib/admin-state';
import {
  addWhatsApp,
  changeAdmin,
  createHousehold,
  issueInvitation,
  registerEmail,
  removeWhatsApp,
  revokeAccess,
  saveHousehold,
} from './actions';

const redirect = jest.fn((path: string): never => {
  throw new Error(`redirected to ${path}`);
});
const revalidatePath = jest.fn();
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

jest.mock('next/headers', () => ({
  cookies: (): Promise<unknown> => Promise.resolve({ get: () => ({ value: 'session-token' }) }),
}));

jest.mock('next/navigation', () => ({
  redirect: (path: string): never => redirect(path),
  notFound: (): never => {
    throw new Error('not found');
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...parameters: unknown[]): unknown => revalidatePath(...parameters),
}));

function respond(status: number, body?: unknown): void {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  } as Response);
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

function sent(): { url: string; method: string | undefined; body: unknown } {
  const [url, init] = fetchMock.mock.calls[0] ?? ['', {}];
  return {
    url,
    method: init.method,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
  };
}

const HOUSEHOLD = {
  name: 'Família Nova',
  firstMember: 'Pessoa Um',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  locale: 'pt-BR',
};

describe('administration actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('creates a household and opens it', async () => {
    respond(201, { key: 'household-key' });

    await expect(createHousehold(INITIAL_ADMIN_STATE, form(HOUSEHOLD))).rejects.toThrow(
      'redirected to /admin/household-key',
    );
    expect(sent()).toEqual({
      url: 'http://localhost:3000/platform/households',
      method: 'POST',
      body: HOUSEHOLD,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin', 'layout');
  });

  it('keeps what was typed and says which field is wrong', async () => {
    respond(422, { errors: [{ field: 'timezone', code: 'UNKNOWN' }] });

    const state = await createHousehold(
      INITIAL_ADMIN_STATE,
      form({ ...HOUSEHOLD, timezone: 'Mars/Base' }),
    );

    expect(state).toMatchObject({
      problem: 'INVALID',
      errors: { timezone: 'UNKNOWN' },
      values: { timezone: 'Mars/Base', name: 'Família Nova' },
      done: 0,
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('saves settings without the currency and reports success', async () => {
    respond(204);

    const state = await saveHousehold(
      INITIAL_ADMIN_STATE,
      form({
        household: 'household key',
        name: 'X',
        timezone: 'Europe/Lisbon',
        locale: 'en',
        currency: 'USD',
      }),
    );

    expect(sent()).toEqual({
      url: 'http://localhost:3000/platform/households/household%20key',
      method: 'PATCH',
      body: { name: 'X', timezone: 'Europe/Lisbon', locale: 'en' },
    });
    expect(state).toMatchObject({ problem: null, done: 1, attempt: 1 });
  });

  it('registers an email and a WhatsApp number on the member named', async () => {
    respond(204);
    await registerEmail(
      INITIAL_ADMIN_STATE,
      form({ household: 'h', member: 'm/1', email: 'a@example.com' }),
    );
    expect(sent()).toMatchObject({
      url: 'http://localhost:3000/platform/households/h/members/m%2F1/email',
      body: { email: 'a@example.com' },
    });

    fetchMock.mockClear();
    respond(422, { errors: [{ field: 'phoneNumber', code: 'DUPLICATE' }] });
    const state = await addWhatsApp(
      INITIAL_ADMIN_STATE,
      form({ household: 'h', member: 'm', phoneNumber: '+5511999990001' }),
    );
    expect(sent()).toMatchObject({
      url: 'http://localhost:3000/platform/households/h/members/m/whatsapp',
      method: 'POST',
    });
    expect(state.errors).toEqual({ phoneNumber: 'DUPLICATE' });
  });

  it('hands the invitation code to the form once, and only on success', async () => {
    respond(201, { member: 'Pessoa Um', code: 'secret-code', email: null });

    const state = await issueInvitation(INITIAL_ADMIN_STATE, form({ household: 'h', member: 'm' }));

    expect(sent()).toMatchObject({
      url: 'http://localhost:3000/platform/households/h/members/m/invitation',
      method: 'POST',
    });
    expect(state.invitation).toEqual({ member: 'Pessoa Um', code: 'secret-code', email: null });

    respond(404);
    expect(
      (await issueInvitation(state, form({ household: 'h', member: 'm' }))).invitation,
    ).toBeNull();
  });

  it('grants and revokes admin, and explains why the last admin stays', async () => {
    respond(204);
    await changeAdmin(INITIAL_ADMIN_STATE, form({ household: 'h', member: 'm', grant: 'true' }));
    expect(sent().method).toBe('POST');

    fetchMock.mockClear();
    respond(422, { errors: [{ field: 'form', code: 'NOT_ALLOWED' }] });
    const state = await changeAdmin(
      INITIAL_ADMIN_STATE,
      form({ household: 'h', member: 'm', grant: 'false' }),
    );
    expect(sent()).toMatchObject({
      url: 'http://localhost:3000/platform/households/h/members/m/admin',
      method: 'DELETE',
    });
    expect(state).toMatchObject({ problem: 'INVALID', errors: { form: 'NOT_ALLOWED' } });
  });

  it('revokes access and removes numbers, treating something already gone as done', async () => {
    respond(404);
    await revokeAccess(form({ household: 'h', member: 'm' }));
    expect(sent()).toMatchObject({
      url: 'http://localhost:3000/platform/households/h/members/m/access',
      method: 'DELETE',
    });

    fetchMock.mockClear();
    respond(204);
    await removeWhatsApp(form({ household: 'h', identity: 'i' }));
    expect(sent()).toMatchObject({
      url: 'http://localhost:3000/platform/households/h/whatsapp/i',
      method: 'DELETE',
    });

    respond(500);
    await expect(removeWhatsApp(form({ household: 'h', identity: 'i' }))).rejects.toThrow(
      'status 500',
    );
  });
});
