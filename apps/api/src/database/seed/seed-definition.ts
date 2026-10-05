import { z } from 'zod';
import { isSupportedCurrency } from '../../money/money.js';

const currency = z.string().refine(isSupportedCurrency);
const name = z.string().trim().min(1);
const positiveMinorAmount = z.number().int().positive();

const memberDefinition = z.object({
  name,
  whatsapp: z
    .object({
      provider: name,
      externalUserId: name,
      phoneNumber: z.e164(),
    })
    .optional(),
});

const accountDefinition = z.object({
  name,
  type: z.enum(['BANK', 'CASH', 'CREDIT_CARD', 'SAVINGS']),
  owner: name.optional(),
  currency: currency.optional(),
  openingBalanceMinor: z.number().int().default(0),
});

const budgetDefinition = z.object({
  category: name.optional(),
  period: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
  limitMinor: positiveMinorAmount,
  startsOn: z.iso.date(),
});

const goalDefinition = z.object({
  name,
  type: z.enum(['EMERGENCY_FUND', 'TRAVEL', 'PURCHASE', 'SAVINGS']),
  targetAmountMinor: positiveMinorAmount,
  currentAmountMinor: z.number().int().nonnegative().default(0),
  targetDate: z.iso.date().optional(),
});

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const seedDefinitionSchema = z
  .object({
    household: z.object({ name, currency }),
    members: z.array(memberDefinition).min(1),
    accounts: z.array(accountDefinition).default([]),
    budgets: z.array(budgetDefinition).default([]),
    goals: z.array(goalDefinition).default([]),
  })
  .refine(({ members }) => !hasDuplicates(members.map((member) => member.name)), {
    path: ['members'],
    error: 'Member names must be unique within the household',
  })
  .refine(({ accounts }) => !hasDuplicates(accounts.map((account) => account.name)), {
    path: ['accounts'],
    error: 'Account names must be unique within the household',
  })
  .refine(
    ({ members, accounts }) =>
      accounts.every(
        (account) =>
          account.owner === undefined || members.some((member) => member.name === account.owner),
      ),
    { path: ['accounts'], error: 'Account owners must be members of the household' },
  );

export type SeedDefinitionInput = z.input<typeof seedDefinitionSchema>;
export type SeedDefinition = z.output<typeof seedDefinitionSchema>;
