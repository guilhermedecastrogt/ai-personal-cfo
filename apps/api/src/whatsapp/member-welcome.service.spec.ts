import type { AppConfig } from '../config/app-config.js';
import type { HouseholdsRepository } from '../households/households.repository.js';
import { FakeWhatsAppProvider } from './testing/fake-whatsapp-provider.fixture.js';
import { MemberWelcomeService, firstNameOf } from './member-welcome.service.js';

const HOUSEHOLD = { id: 'household', name: 'Família Castro', locale: 'pt-BR' };
const MEMBER = { id: 'member', name: 'Beatriz  Souza' };

function households(addresses: { memberId: string; address: string }[] = []): HouseholdsRepository {
  return {
    findHousehold: () => Promise.resolve(HOUSEHOLD),
    findMember: () => Promise.resolve(MEMBER),
    listWhatsAppAddresses: () =>
      Promise.resolve(addresses.map((entry) => ({ ...entry, memberName: MEMBER.name }))),
  } as unknown as HouseholdsRepository;
}

function service(
  provider: FakeWhatsAppProvider,
  template: string | null,
  repository = households(),
): MemberWelcomeService {
  return new MemberWelcomeService(provider, { welcomeTemplate: template } as AppConfig, repository);
}

describe('MemberWelcomeService', () => {
  it('sends the approved template in the household’s language, greeting by first name', async () => {
    const provider = new FakeWhatsAppProvider();

    const result = await service(provider, 'boas_vindas').welcome(
      'household',
      'member',
      '5511999990001',
    );

    expect(result).toBe('SENT');
    expect(provider.templates).toEqual([
      {
        to: '5511999990001',
        name: 'boas_vindas',
        language: 'pt_BR',
        parameters: ['Beatriz'],
      },
    ]);
    expect(provider.sent).toEqual([]);
  });

  it('uses the member’s latest number when none is given', async () => {
    const provider = new FakeWhatsAppProvider();
    const repository = households([
      { memberId: 'other', address: '1' },
      { memberId: 'member', address: '2' },
      { memberId: 'member', address: '3' },
    ]);

    await service(provider, 'boas_vindas', repository).welcome('household', 'member');

    expect(provider.templates.map((template) => template.to)).toEqual(['3']);
  });

  it('sends nothing when no template is configured or the member has no number', async () => {
    const provider = new FakeWhatsAppProvider();

    expect(await service(provider, null).welcome('household', 'member', '1')).toBe('DISABLED');
    expect(await service(provider, 'boas_vindas').welcome('household', 'member')).toBe('NO_NUMBER');
    expect(provider.templates).toEqual([]);
  });

  it('reports a refused send instead of failing', async () => {
    const provider = new FakeWhatsAppProvider().willFailToSend('REJECTED');

    expect(await service(provider, 'boas_vindas').welcome('household', 'member', '1')).toBe(
      'FAILED',
    );
  });

  it.each([
    ['Beatriz Souza', 'Beatriz'],
    ['  Gui  ', 'Gui'],
  ])('greets %s as %s', (name, first) => {
    expect(firstNameOf(name)).toBe(first);
  });
});
