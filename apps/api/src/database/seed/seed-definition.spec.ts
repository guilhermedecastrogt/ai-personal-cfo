import { demoHousehold } from './demo-household.js';
import { seedDefinitionSchema, type SeedDefinitionInput } from './seed-definition.js';

const MINIMAL: SeedDefinitionInput = {
  household: { name: 'Solo', currency: 'EUR' },
  members: [{ name: 'Member A' }],
};

describe('seedDefinitionSchema', () => {
  it('accepts the committed demo household', () => {
    expect(seedDefinitionSchema.safeParse(demoHousehold).success).toBe(true);
  });

  it('accepts a household with a single member and nothing else', () => {
    expect(seedDefinitionSchema.parse(MINIMAL)).toMatchObject({
      accounts: [],
      budgets: [],
      goals: [],
    });
  });

  it('accepts a household with many members', () => {
    const members = Array.from({ length: 12 }, (_, index) => ({
      name: `Member ${String(index + 1)}`,
    }));

    expect(seedDefinitionSchema.safeParse({ ...MINIMAL, members }).success).toBe(true);
  });

  it('rejects a household without members', () => {
    expect(seedDefinitionSchema.safeParse({ ...MINIMAL, members: [] }).success).toBe(false);
  });

  it('rejects two members with the same name', () => {
    const members = [{ name: 'Member A' }, { name: 'Member A' }];

    expect(seedDefinitionSchema.safeParse({ ...MINIMAL, members }).success).toBe(false);
  });

  it('rejects an account owned by someone outside the household', () => {
    const accounts = [{ name: 'Current', type: 'BANK' as const, owner: 'Stranger' }];

    expect(seedDefinitionSchema.safeParse({ ...MINIMAL, accounts }).success).toBe(false);
  });

  it('accepts an account without an owner as a joint account', () => {
    const accounts = [{ name: 'Joint', type: 'BANK' as const }];

    expect(seedDefinitionSchema.safeParse({ ...MINIMAL, accounts }).success).toBe(true);
  });

  it('rejects a phone number that is not in E.164 form', () => {
    const members = [
      {
        name: 'Member A',
        whatsapp: { provider: 'kapso', externalUserId: '1', phoneNumber: '085 123' },
      },
    ];

    expect(seedDefinitionSchema.safeParse({ ...MINIMAL, members }).success).toBe(false);
  });

  it('rejects an unsupported currency', () => {
    const household = { name: 'Solo', currency: 'EURO' };

    expect(seedDefinitionSchema.safeParse({ ...MINIMAL, household }).success).toBe(false);
  });
});
