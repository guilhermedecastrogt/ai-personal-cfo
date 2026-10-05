import { asc, isNull, sql } from 'drizzle-orm';
import { categories } from '../src/categories/categories.schema.js';
import { applyMigrations } from '../src/database/migrations.js';
import { createEmptyTestDatabase, type TestDatabase } from './support/test-database.js';

const EXPECTED_TABLES = [
  'accounts',
  'ai_conversations',
  'ai_messages',
  'budgets',
  'categories',
  'dashboard_sessions',
  'evaluation_leases',
  'goals',
  'households',
  'insights',
  'member_access_codes',
  'member_default_accounts',
  'members',
  'monthly_reports',
  'notification_deliveries',
  'proactive_notifications',
  'recurring_expenses',
  'transactions',
  'webhook_events',
  'whatsapp_identities',
];

const EXPECTED_CATEGORY_TREE = {
  Education: [],
  Entertainment: [],
  Food: ['Coffee', 'Delivery', 'Groceries', 'Restaurants'],
  Freelance: [],
  Health: [],
  Housing: ['Electricity', 'Internet', 'Rent'],
  Other: [],
  Salary: [],
  Shopping: [],
  Subscriptions: [],
  Transport: ['Fuel', 'Public Transport', 'Uber'],
  Travel: [],
};

describe('migrations', () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await createEmptyTestDatabase();
    await applyMigrations(testDatabase.database);
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  it('build the complete schema in an empty database', async () => {
    const result = await testDatabase.database.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
  });

  it('can be applied again without changing anything', async () => {
    await applyMigrations(testDatabase.database);

    const rows = await testDatabase.database.select().from(categories);

    expect(rows).toHaveLength(22);
  });

  it('create the default category hierarchy', async () => {
    const rows = await testDatabase.database
      .select()
      .from(categories)
      .orderBy(asc(categories.name));
    const tree = Object.fromEntries(
      rows
        .filter((category) => category.parentId === null)
        .map((parent) => [
          parent.name,
          rows.filter((child) => child.parentId === parent.id).map((child) => child.name),
        ]),
    );

    expect(tree).toEqual(EXPECTED_CATEGORY_TREE);
  });

  it('mark salary and freelance as income and everything else as expense', async () => {
    const topLevel = await testDatabase.database
      .select()
      .from(categories)
      .where(isNull(categories.parentId));
    const incomeNames = topLevel
      .filter((category) => category.kind === 'INCOME')
      .map((category) => category.name)
      .sort();

    expect(incomeNames).toEqual(['Freelance', 'Salary']);
  });

  it('give every subcategory the kind of its parent', async () => {
    const rows = await testDatabase.database.select().from(categories);
    const kindById = new Map(rows.map((category) => [category.id, category.kind]));
    const mismatched = rows.filter(
      (category) => category.parentId !== null && kindById.get(category.parentId) !== category.kind,
    );

    expect(mismatched).toEqual([]);
  });
});
