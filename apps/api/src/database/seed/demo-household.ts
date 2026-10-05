import type { SeedDefinitionInput } from './seed-definition.js';

export const demoHousehold: SeedDefinitionInput = {
  household: { name: 'Demo Household', currency: 'EUR', timezone: 'Europe/Dublin' },
  members: [
    {
      name: 'Member A',
      whatsapp: { provider: 'kapso', externalUserId: '12025550101', phoneNumber: '+12025550101' },
    },
    {
      name: 'Member B',
      whatsapp: { provider: 'kapso', externalUserId: '12025550102', phoneNumber: '+12025550102' },
    },
    { name: 'Member C' },
  ],
  accounts: [
    { name: 'Member A Current', type: 'BANK', owner: 'Member A', openingBalanceMinor: 120000 },
    { name: 'Member B Current', type: 'BANK', owner: 'Member B', openingBalanceMinor: 95000 },
    { name: 'Member B Credit Card', type: 'CREDIT_CARD', owner: 'Member B' },
    { name: 'Member C Cash', type: 'CASH', owner: 'Member C', openingBalanceMinor: 8000 },
    { name: 'Joint Account', type: 'BANK', openingBalanceMinor: 250000 },
    { name: 'Joint Savings', type: 'SAVINGS', openingBalanceMinor: 500000 },
  ],
  budgets: [
    { category: 'Restaurants', period: 'MONTHLY', limitMinor: 30000, startsOn: '2026-01-01' },
    { category: 'Groceries', period: 'MONTHLY', limitMinor: 60000, startsOn: '2026-01-01' },
    { period: 'MONTHLY', limitMinor: 250000, startsOn: '2026-01-01' },
  ],
  goals: [
    {
      name: 'Emergency Fund',
      type: 'EMERGENCY_FUND',
      targetAmountMinor: 1000000,
      currentAmountMinor: 500000,
    },
    {
      name: 'Summer Trip',
      type: 'TRAVEL',
      targetAmountMinor: 100000,
      currentAmountMinor: 62000,
      targetDate: '2027-06-30',
    },
  ],
};
