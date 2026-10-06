import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
  UseFilters,
  UseGuards,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import { CurrentContext, SessionGuard } from '../auth/session.guard.js';
import { FutureMonthError } from '../cfo/cfo.service.js';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard.js';
import type { RequestContext } from '../households/request-context.js';
import { TRANSACTION_SORTS, TRANSACTION_TYPES } from '../transactions/transaction-vocabulary.js';
import { RECURRING_SORTS } from './dashboard.contracts.js';
import type {
  AccountsView,
  CompareView,
  EvolutionView,
  MemberView,
  MembersView,
  BudgetEditView,
  GoalEditView,
  SavedView,
  TransactionEditView,
  BudgetsView,
  GoalsView,
  IncomeView,
  NotificationsView,
  RecurringView,
  OutlookView,
  OverviewView,
  ReviewView,
  SessionView,
  SignalsView,
  SpendingView,
  TransactionsView,
} from './dashboard.contracts.js';
import { DashboardWritesService, type WriteOutcome } from './dashboard-writes.service.js';
import { DashboardService, InvalidRangeError } from './dashboard.service.js';
import { InvalidMonthError } from './month-selection.js';
import {
  budgetEditRequestSchema,
  budgetRequestSchema,
  goalEditRequestSchema,
  goalRequestSchema,
  parseRequest,
  transactionEditRequestSchema,
} from './write-requests.js';

const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

const recurringQuerySchema = z.object({ sort: z.enum(RECURRING_SORTS).default('cost') });

const MAXIMUM_PAGE = 10_000;
const HTTP_NO_CONTENT = 204;

const MAXIMUM_SEARCH_LENGTH = 100;

const transactionsQuerySchema = monthQuerySchema.extend({
  type: z.enum(TRANSACTION_TYPES).optional(),
  category: z.uuid().optional(),
  account: z.uuid().optional(),
  member: z.uuid().optional(),
  q: z.string().trim().max(MAXIMUM_SEARCH_LENGTH).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(TRANSACTION_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(MAXIMUM_PAGE).default(1),
});

const evolutionQuerySchema = z.object({
  months: z
    .enum(['6', '12'])
    .default('6')
    .transform((months) => (months === '12' ? 12 : 6)),
});

const compareQuerySchema = z.object({
  a: monthQuerySchema.shape.month,
  b: monthQuerySchema.shape.month,
});

function parseQuery<Schema extends z.ZodType>(schema: Schema, query: unknown): z.output<Schema> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException();
  }
  return parsed.data;
}

function parseKey(key: string): string {
  const parsed = z.uuid().safeParse(key);
  if (!parsed.success) {
    throw new NotFoundException();
  }
  return parsed.data;
}

function found<View>(view: View | undefined): View {
  if (view === undefined) {
    throw new NotFoundException();
  }
  return view;
}

function savedOrThrow(outcome: WriteOutcome): SavedView {
  switch (outcome.status) {
    case 'SAVED':
      return outcome.saved;
    case 'NOT_FOUND':
      throw new NotFoundException();
    case 'STALE':
      throw new ConflictException({ code: 'STALE' });
    case 'INVALID':
      throw new UnprocessableEntityException({ errors: outcome.errors });
  }
}

function removedOrThrow(removed: boolean): void {
  if (!removed) {
    throw new NotFoundException();
  }
}

async function written<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
  write: (request: z.output<Schema>) => Promise<WriteOutcome>,
): Promise<SavedView> {
  const parsed = parseRequest(schema, body);
  if (!parsed.success) {
    throw new UnprocessableEntityException({ errors: parsed.errors });
  }
  return savedOrThrow(await write(parsed.data));
}

@Catch(InvalidMonthError, FutureMonthError, InvalidRangeError)
class InvalidMonthFilter implements ExceptionFilter {
  catch(_error: Error, host: ArgumentsHost): void {
    const exception = new BadRequestException();
    host
      .switchToHttp()
      .getResponse<{ status(code: number): { json(body: unknown): void } }>()
      .status(exception.getStatus())
      .json(exception.getResponse());
  }
}

@Controller('dashboard')
@UseGuards(RateLimitGuard, SessionGuard)
@RateLimit('DASHBOARD')
@UseFilters(InvalidMonthFilter)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly writes: DashboardWritesService,
  ) {}

  @Get('session')
  session(@CurrentContext() context: RequestContext): Promise<SessionView> {
    return this.dashboard.session(context, new Date());
  }

  @Get('overview')
  overview(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<OverviewView> {
    return this.dashboard.overview(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('spending')
  spending(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<SpendingView> {
    return this.dashboard.spending(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('income')
  income(@CurrentContext() context: RequestContext, @Query() query: unknown): Promise<IncomeView> {
    return this.dashboard.income(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('budgets')
  budgets(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<BudgetsView> {
    return this.dashboard.budgets(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('goals')
  goals(@CurrentContext() context: RequestContext, @Query() query: unknown): Promise<GoalsView> {
    return this.dashboard.goals(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('outlook')
  outlook(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<OutlookView> {
    return this.dashboard.outlook(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('signals')
  signals(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<SignalsView> {
    return this.dashboard.signals(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('recurring')
  recurring(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<RecurringView> {
    return this.dashboard.recurring(
      context,
      parseQuery(recurringQuerySchema, query).sort,
      new Date(),
    );
  }

  @Get('notifications')
  notifications(@CurrentContext() context: RequestContext): Promise<NotificationsView> {
    return this.dashboard.notifications(context);
  }

  @Post('notifications/:key/read')
  @HttpCode(HTTP_NO_CONTENT)
  async markNotificationRead(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
  ): Promise<void> {
    const parsed = z.uuid().safeParse(key);
    if (
      !parsed.success ||
      !(await this.dashboard.markNotificationRead(context, parsed.data, new Date()))
    ) {
      throw new NotFoundException();
    }
  }

  @Get('review')
  review(@CurrentContext() context: RequestContext, @Query() query: unknown): Promise<ReviewView> {
    return this.dashboard.review(context, parseQuery(monthQuerySchema, query).month, new Date());
  }

  @Get('transactions')
  transactions(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<TransactionsView> {
    return this.dashboard.transactionHistory(
      context,
      parseQuery(transactionsQuerySchema, query),
      new Date(),
    );
  }

  @Get('transactions/export')
  async exportTransactions(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<string> {
    const exported = await this.dashboard.exportTransactions(
      context,
      parseQuery(transactionsQuerySchema, query),
      new Date(),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    return exported.content;
  }

  @Get('evolution')
  evolution(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<EvolutionView> {
    return this.dashboard.evolution(
      context,
      parseQuery(evolutionQuerySchema, query).months,
      new Date(),
    );
  }

  @Get('compare')
  compare(
    @CurrentContext() context: RequestContext,
    @Query() query: unknown,
  ): Promise<CompareView> {
    const { a, b } = parseQuery(compareQuerySchema, query);
    return this.dashboard.compare(context, a, b, new Date());
  }

  @Get('members')
  members(@CurrentContext() context: RequestContext): Promise<MembersView> {
    return this.dashboard.members(context);
  }

  @Get('members/:key')
  async member(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
    @Query() query: unknown,
  ): Promise<MemberView> {
    return found(
      await this.dashboard.member(
        context,
        parseKey(key),
        parseQuery(monthQuerySchema, query).month,
        new Date(),
      ),
    );
  }

  @Get('accounts')
  accounts(@CurrentContext() context: RequestContext): Promise<AccountsView> {
    return this.dashboard.accounts(context, new Date());
  }

  @Get('transactions/:key')
  async transaction(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
  ): Promise<TransactionEditView> {
    return found(await this.writes.transaction(context, parseKey(key)));
  }

  @Patch('transactions/:key')
  @RateLimit('DASHBOARD_WRITE')
  editTransaction(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<SavedView> {
    const transactionId = parseKey(key);
    return written(transactionEditRequestSchema, body, (request) =>
      this.writes.editTransaction(context, transactionId, request),
    );
  }

  @Delete('transactions/:key')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HTTP_NO_CONTENT)
  async removeTransaction(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
  ): Promise<void> {
    removedOrThrow(await this.writes.removeTransaction(context, parseKey(key)));
  }

  @Get('budgets/:key')
  async budget(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
  ): Promise<BudgetEditView> {
    return found(await this.writes.budget(context, parseKey(key)));
  }

  @Post('budgets')
  @RateLimit('DASHBOARD_WRITE')
  createBudget(
    @CurrentContext() context: RequestContext,
    @Body() body: unknown,
  ): Promise<SavedView> {
    return written(budgetRequestSchema, body, (request) =>
      this.writes.createBudget(context, request),
    );
  }

  @Patch('budgets/:key')
  @RateLimit('DASHBOARD_WRITE')
  editBudget(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<SavedView> {
    const budgetId = parseKey(key);
    return written(budgetEditRequestSchema, body, (request) =>
      this.writes.editBudget(context, budgetId, request),
    );
  }

  @Delete('budgets/:key')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HTTP_NO_CONTENT)
  async removeBudget(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
  ): Promise<void> {
    removedOrThrow(await this.writes.removeBudget(context, parseKey(key), new Date()));
  }

  @Get('goals/:key')
  async goal(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
  ): Promise<GoalEditView> {
    return found(await this.writes.goal(context, parseKey(key)));
  }

  @Post('goals')
  @RateLimit('DASHBOARD_WRITE')
  createGoal(@CurrentContext() context: RequestContext, @Body() body: unknown): Promise<SavedView> {
    return written(goalRequestSchema, body, (request) => this.writes.createGoal(context, request));
  }

  @Patch('goals/:key')
  @RateLimit('DASHBOARD_WRITE')
  editGoal(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<SavedView> {
    const goalId = parseKey(key);
    return written(goalEditRequestSchema, body, (request) =>
      this.writes.editGoal(context, goalId, request),
    );
  }

  @Delete('goals/:key')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HTTP_NO_CONTENT)
  async removeGoal(
    @CurrentContext() context: RequestContext,
    @Param('key') key: string,
  ): Promise<void> {
    removedOrThrow(await this.writes.removeGoal(context, parseKey(key)));
  }
}
