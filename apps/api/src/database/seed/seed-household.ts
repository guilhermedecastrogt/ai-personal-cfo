import { eq } from 'drizzle-orm';
import { accounts } from '../../accounts/accounts.schema.js';
import { budgets } from '../../budgets/budgets.schema.js';
import { categories } from '../../categories/categories.schema.js';
import { goals } from '../../goals/goals.schema.js';
import { households, members, whatsappIdentities } from '../../households/households.schema.js';
import type { Database } from '../database.js';
import { deterministicUuid } from './deterministic-uuid.js';
import type { SeedDefinition } from './seed-definition.js';

export class UnknownSeedCategoryError extends Error {
  constructor(categoryName: string) {
    super(`Seed refers to a category that does not exist exactly once: ${categoryName}`);
    this.name = UnknownSeedCategoryError.name;
  }
}

export interface SeededHousehold {
  readonly householdId: string;
  readonly memberIds: ReadonlyMap<string, string>;
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function seedHousehold(
  database: Database,
  definition: SeedDefinition,
): Promise<SeededHousehold> {
  return database.transaction(async (transaction) => {
    const householdId = deterministicUuid('household', definition.household.name);
    await transaction
      .insert(households)
      .values({ id: householdId, ...definition.household })
      .onConflictDoNothing();
    const memberIds = await seedMembers(transaction, householdId, definition);
    await seedAccounts(transaction, householdId, memberIds, definition);
    await seedBudgets(transaction, householdId, definition);
    await seedGoals(transaction, householdId, definition);
    return { householdId, memberIds };
  });
}

async function seedMembers(
  transaction: Transaction,
  householdId: string,
  definition: SeedDefinition,
): Promise<Map<string, string>> {
  const memberIds = new Map<string, string>();
  for (const member of definition.members) {
    const memberId = deterministicUuid(householdId, 'member', member.name);
    memberIds.set(member.name, memberId);
    await transaction
      .insert(members)
      .values({ id: memberId, householdId, name: member.name })
      .onConflictDoNothing();
    if (member.whatsapp !== undefined) {
      await transaction
        .insert(whatsappIdentities)
        .values({ memberId, ...member.whatsapp })
        .onConflictDoNothing();
    }
  }
  return memberIds;
}

async function seedAccounts(
  transaction: Transaction,
  householdId: string,
  memberIds: ReadonlyMap<string, string>,
  definition: SeedDefinition,
): Promise<void> {
  for (const account of definition.accounts) {
    await transaction
      .insert(accounts)
      .values({
        id: deterministicUuid(householdId, 'account', account.name),
        householdId,
        ownerMemberId: account.owner === undefined ? null : memberIds.get(account.owner),
        name: account.name,
        type: account.type,
        currency: account.currency ?? definition.household.currency,
        openingBalanceMinor: account.openingBalanceMinor,
      })
      .onConflictDoNothing();
  }
}

async function seedBudgets(
  transaction: Transaction,
  householdId: string,
  definition: SeedDefinition,
): Promise<void> {
  for (const budget of definition.budgets) {
    await transaction
      .insert(budgets)
      .values({
        householdId,
        categoryId:
          budget.category === undefined ? null : await findCategoryId(transaction, budget.category),
        period: budget.period,
        limitMinor: budget.limitMinor,
        currency: definition.household.currency,
        startsOn: budget.startsOn,
      })
      .onConflictDoNothing();
  }
}

async function seedGoals(
  transaction: Transaction,
  householdId: string,
  definition: SeedDefinition,
): Promise<void> {
  for (const goal of definition.goals) {
    await transaction
      .insert(goals)
      .values({
        id: deterministicUuid(householdId, 'goal', goal.name),
        householdId,
        name: goal.name,
        type: goal.type,
        targetAmountMinor: goal.targetAmountMinor,
        currentAmountMinor: goal.currentAmountMinor,
        currency: definition.household.currency,
        targetDate: goal.targetDate ?? null,
      })
      .onConflictDoNothing();
  }
}

async function findCategoryId(transaction: Transaction, categoryName: string): Promise<string> {
  const matches = await transaction
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, categoryName));
  const [match] = matches;
  if (match === undefined || matches.length > 1) {
    throw new UnknownSeedCategoryError(categoryName);
  }
  return match.id;
}
