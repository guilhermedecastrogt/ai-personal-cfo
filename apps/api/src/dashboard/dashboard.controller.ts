import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentContext, SessionGuard } from '../auth/session.guard.js';
import { FutureMonthError } from '../cfo/cfo.service.js';
import type { RequestContext } from '../households/request-context.js';
import { TRANSACTION_TYPES } from '../transactions/transaction-vocabulary.js';
import type {
  AccountsView,
  BudgetsView,
  GoalsView,
  IncomeView,
  NotificationsView,
  OutlookView,
  OverviewView,
  ReviewView,
  SessionView,
  SignalsView,
  SpendingView,
  TransactionsView,
} from './dashboard.contracts.js';
import { DashboardService } from './dashboard.service.js';
import { InvalidMonthError } from './month-selection.js';

const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

const MAXIMUM_PAGE = 10_000;
const HTTP_NO_CONTENT = 204;

const transactionsQuerySchema = monthQuerySchema.extend({
  type: z.enum(TRANSACTION_TYPES).optional(),
  category: z.uuid().optional(),
  account: z.uuid().optional(),
  member: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(MAXIMUM_PAGE).default(1),
});

function parseQuery<Schema extends z.ZodType>(schema: Schema, query: unknown): z.output<Schema> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException();
  }
  return parsed.data;
}

@Catch(InvalidMonthError, FutureMonthError)
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
@UseGuards(SessionGuard)
@UseFilters(InvalidMonthFilter)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

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

  @Get('accounts')
  accounts(@CurrentContext() context: RequestContext): Promise<AccountsView> {
    return this.dashboard.accounts(context, new Date());
  }
}
