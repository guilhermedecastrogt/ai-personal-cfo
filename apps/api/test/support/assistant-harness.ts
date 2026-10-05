import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountsRepository } from '../../src/accounts/accounts.repository.js';
import { MessageInterpreter } from '../../src/ai/interpretation/message-interpreter.js';
import { ReplyComposer } from '../../src/ai/reply/reply-composer.js';
import { FakeAIProvider } from '../../src/ai/testing/fake-ai-provider.fixture.js';
import { ImageTransactionReader } from '../../src/ai/vision/image-transaction-reader.js';
import { BudgetsRepository } from '../../src/budgets/budgets.repository.js';
import { CategoriesRepository } from '../../src/categories/categories.repository.js';
import { FinancialSnapshotBuilder } from '../../src/cfo/analysis/financial-snapshot.builder.js';
import { CfoService } from '../../src/cfo/cfo.service.js';
import { ReviewExplainer } from '../../src/cfo/explanation/review-explainer.js';
import type { AppConfig } from '../../src/config/app-config.js';
import { ConversationsRepository } from '../../src/conversation/conversations.repository.js';
import { TransactionExtractionService } from '../../src/conversation/extraction/transaction-extraction.service.js';
import { FinancialAssistant } from '../../src/conversation/financial-assistant.service.js';
import { ImageTransactionService } from '../../src/conversation/image/image-transaction.service.js';
import { FinancialQueryService } from '../../src/conversation/queries/financial-query.service.js';
import type { Database } from '../../src/database/database.js';
import { HouseholdDirectoryService } from '../../src/directory/household-directory.service.js';
import { FinanceService } from '../../src/finance/application/finance.service.js';
import { LedgerRepository } from '../../src/finance/infrastructure/ledger.repository.js';
import { GoalsRepository } from '../../src/goals/goals.repository.js';
import { HouseholdsRepository } from '../../src/households/households.repository.js';
import { DEFAULT_MEDIA_POLICY, type MediaPolicy } from '../../src/media/media-policy.js';
import { TemporaryMediaStore } from '../../src/media/temporary-media-store.js';
import { FakeMediaSource } from '../../src/media/testing/fake-media-source.fixture.js';
import { SECURITY_POLICY, type SecurityPolicy } from '../../src/security/security-policy.js';
import { TransactionsRepository } from '../../src/transactions/transactions.repository.js';
import { TransactionsService } from '../../src/transactions/transactions.service.js';

export const TEST_CONFIG: AppConfig = {
  environment: 'test',
  port: 0,
  logLevel: 'error',
  databaseUrl: 'postgres://unused',
  openaiApiKey: 'unused',
  openaiModel: 'unused',
  aiConfidenceThreshold: 0.8,
  kapsoApiKey: 'unused',
  kapsoWebhookSecret: 'unused',
  kapsoPhoneNumberId: '000000000000000',
  kapsoApiBaseUrl: 'https://api.kapso.invalid/meta/whatsapp/v24.0',
  proactiveEvaluationEnabled: false,
  proactiveAiMessages: false,
  trustedProxyHops: 0,
};

const UNLIMITED = { limit: 1_000_000, windowInSeconds: 60 };

export const RELAXED_SECURITY_POLICY: SecurityPolicy = {
  ...SECURITY_POLICY,
  rateLimits: { AUTHENTICATION: UNLIMITED, DASHBOARD: UNLIMITED, WEBHOOK: UNLIMITED },
  sessions: { ...SECURITY_POLICY.sessions, maximumPerMember: 10_000 },
  inboundMessages: { text: UNLIMITED, image: UNLIMITED },
};

export interface AssistantHarness {
  readonly assistant: FinancialAssistant;
  readonly cfo: CfoService;
  readonly households: HouseholdsRepository;
  readonly provider: FakeAIProvider;
  readonly mediaSource: FakeMediaSource;
  readonly finance: FinanceService;
  readonly accounts: AccountsRepository;
  readonly budgets: BudgetsRepository;
  readonly goals: GoalsRepository;
  readonly transactions: TransactionsRepository;
  temporaryFiles(): Promise<string[]>;
  dispose(): Promise<void>;
}

export async function createAssistantHarness(
  database: Database,
  mediaPolicy: MediaPolicy = DEFAULT_MEDIA_POLICY,
): Promise<AssistantHarness> {
  const mediaRoot = await mkdtemp(join(tmpdir(), 'cfo-assistant-test-'));
  const households = new HouseholdsRepository(database);
  const categories = new CategoriesRepository(database);
  const accounts = new AccountsRepository(database);
  const budgets = new BudgetsRepository(database);
  const goals = new GoalsRepository(database);
  const transactions = new TransactionsRepository(database);
  const transactionsService = new TransactionsService(
    transactions,
    households,
    accounts,
    categories,
  );
  const finance = new FinanceService(
    new LedgerRepository(database),
    households,
    categories,
    budgets,
    goals,
    accounts,
  );
  const provider = new FakeAIProvider();
  const mediaSource = new FakeMediaSource();
  const directory = new HouseholdDirectoryService(households, accounts, categories, goals);
  const extraction = new TransactionExtractionService(transactionsService, directory, TEST_CONFIG);
  const cfo = new CfoService(
    new FinancialSnapshotBuilder(finance),
    new ReviewExplainer(provider),
    households,
    accounts,
    categories,
    goals,
  );
  const assistant = new FinancialAssistant(
    new MessageInterpreter(provider),
    new ReplyComposer(provider),
    extraction,
    new FinancialQueryService(finance, directory),
    new ImageTransactionService(
      new TemporaryMediaStore(mediaSource, mediaRoot, mediaPolicy),
      new ImageTransactionReader(provider),
      extraction,
      transactionsService,
      directory,
    ),
    cfo,
    finance,
    new ConversationsRepository(database),
    directory,
  );
  return {
    assistant,
    cfo,
    households,
    provider,
    mediaSource,
    finance,
    accounts,
    budgets,
    goals,
    transactions,
    temporaryFiles: () => readdir(mediaRoot, { recursive: true }),
    dispose: () => rm(mediaRoot, { recursive: true, force: true }),
  };
}
