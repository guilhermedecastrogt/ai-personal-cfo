import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentContext, SessionGuard } from '../auth/session.guard.js';
import type { RequestContext } from '../households/request-context.js';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import type {
  CreatedView,
  HouseholdDetailView,
  HouseholdsOverviewView,
  InvitationView,
} from './platform.contracts.js';
import {
  emailRequestSchema,
  householdSettingsRequestSchema,
  newHouseholdRequestSchema,
  newMemberRequestSchema,
  parsePlatformRequest,
  whatsappIdentityRequestSchema,
} from './platform-requests.js';
import { PlatformService, type PlatformOutcome } from './platform.service.js';

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

function removedOrThrow(removed: boolean): void {
  if (!removed) {
    throw new NotFoundException();
  }
}

function completed<View>(outcome: PlatformOutcome<View>): View {
  switch (outcome.status) {
    case 'DONE':
      return outcome.view;
    case 'NOT_FOUND':
      throw new NotFoundException();
    case 'INVALID':
      throw new UnprocessableEntityException({ errors: outcome.errors });
  }
}

async function handled<Schema extends z.ZodType, View>(
  schema: Schema,
  body: unknown,
  handle: (request: z.output<Schema>) => Promise<PlatformOutcome<View>>,
): Promise<View> {
  const parsed = parsePlatformRequest(schema, body);
  if (!parsed.success) {
    throw new UnprocessableEntityException({ errors: parsed.errors });
  }
  return completed(await handle(parsed.data));
}

@Controller('platform')
@UseGuards(RateLimitGuard, SessionGuard, PlatformAdminGuard)
@RateLimit('DASHBOARD')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('households')
  households(@CurrentContext() context: RequestContext): Promise<HouseholdsOverviewView> {
    return this.platform.overview(context);
  }

  @Post('households')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.CREATED)
  createHousehold(
    @CurrentContext() context: RequestContext,
    @Body() body: unknown,
  ): Promise<CreatedView> {
    return handled(newHouseholdRequestSchema, body, (request) =>
      this.platform.createHousehold(context, request),
    );
  }

  @Get('households/:household')
  async household(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
  ): Promise<HouseholdDetailView> {
    return found(await this.platform.household(context, parseKey(household)));
  }

  @Patch('households/:household')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateHousehold(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Body() body: unknown,
  ): Promise<void> {
    const householdId = parseKey(household);
    await handled(householdSettingsRequestSchema, body, (request) =>
      this.platform.updateHousehold(context, householdId, request),
    );
  }

  @Post('households/:household/members')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Body() body: unknown,
  ): Promise<CreatedView> {
    const householdId = parseKey(household);
    return handled(newMemberRequestSchema, body, (request) =>
      this.platform.addMember(context, householdId, request.name),
    );
  }

  @Patch('households/:household/members/:member/email')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerEmail(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Param('member') member: string,
    @Body() body: unknown,
  ): Promise<void> {
    const householdId = parseKey(household);
    const memberId = parseKey(member);
    await handled(emailRequestSchema, body, (request) =>
      this.platform.registerEmail(context, householdId, memberId, request.email),
    );
  }

  @Post('households/:household/members/:member/invitation')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.CREATED)
  async issueInvitation(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Param('member') member: string,
  ): Promise<InvitationView> {
    return found(
      await this.platform.issueInvitation(context, parseKey(household), parseKey(member)),
    );
  }

  @Delete('households/:household/members/:member/access')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAccess(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Param('member') member: string,
  ): Promise<void> {
    removedOrThrow(
      await this.platform.revokeAccess(context, parseKey(household), parseKey(member)),
    );
  }

  @Post('households/:household/members/:member/whatsapp')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.CREATED)
  addWhatsAppIdentity(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Param('member') member: string,
    @Body() body: unknown,
  ): Promise<CreatedView> {
    const householdId = parseKey(household);
    const memberId = parseKey(member);
    return handled(whatsappIdentityRequestSchema, body, (request) =>
      this.platform.addWhatsAppIdentity(context, householdId, memberId, request),
    );
  }

  @Delete('households/:household/whatsapp/:identity')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWhatsAppIdentity(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Param('identity') identity: string,
  ): Promise<void> {
    removedOrThrow(
      await this.platform.removeWhatsAppIdentity(context, parseKey(household), parseKey(identity)),
    );
  }

  @Post('households/:household/members/:member/admin')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.NO_CONTENT)
  async grantAdmin(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Param('member') member: string,
  ): Promise<void> {
    completed(await this.platform.grantAdmin(context, parseKey(household), parseKey(member)));
  }

  @Delete('households/:household/members/:member/admin')
  @RateLimit('DASHBOARD_WRITE')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAdmin(
    @CurrentContext() context: RequestContext,
    @Param('household') household: string,
    @Param('member') member: string,
  ): Promise<void> {
    completed(await this.platform.revokeAdmin(context, parseKey(household), parseKey(member)));
  }
}
