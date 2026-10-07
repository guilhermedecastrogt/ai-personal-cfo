import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { isSupportedTimeZone } from '../finance/domain/period/period.js';
import { HouseholdsRepository, type Household } from '../households/households.repository.js';
import type { RequestContext } from '../households/request-context.js';
import { LOCALES, localeOr } from '../i18n/locale.js';
import { isSupportedCurrency } from '../money/money.js';
import { WhatsAppIdentityService } from '../whatsapp/whatsapp-identity.service.js';
import { PlatformAdminsRepository, type PlatformAction } from './platform-admins.repository.js';
import {
  createdSchema,
  householdDetailSchema,
  householdsOverviewSchema,
  invitationSchema,
  type CreatedView,
  type HouseholdDetailView,
  type HouseholdsOverviewView,
  type InvitationView,
  type PlatformFieldError,
} from './platform.contracts.js';
import type {
  HouseholdSettingsRequest,
  NewHouseholdRequest,
  WhatsAppIdentityRequest,
} from './platform-requests.js';

const COMMON_CURRENCIES = ['BRL', 'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'];
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const ISO_DATE_LENGTH = 10;

export type PlatformOutcome<View = undefined> =
  | { readonly status: 'DONE'; readonly view: View }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'INVALID'; readonly errors: PlatformFieldError[] };

function done<View>(view: View): PlatformOutcome<View> {
  return { status: 'DONE', view };
}

function invalid<View>(field: string, code: PlatformFieldError['code']): PlatformOutcome<View> {
  return { status: 'INVALID', errors: [{ field, code }] };
}

const NOT_FOUND = { status: 'NOT_FOUND' } as const;

function dateOf(instant: Date): string {
  return instant.toISOString().slice(0, ISO_DATE_LENGTH);
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly households: HouseholdsRepository,
    private readonly auth: AuthService,
    private readonly admins: PlatformAdminsRepository,
    private readonly whatsapp: WhatsAppIdentityService,
  ) {}

  async overview(actor: RequestContext): Promise<HouseholdsOverviewView> {
    const [households, memberCounts, admins] = await Promise.all([
      this.households.listHouseholds(),
      this.households.countMembersByHousehold(),
      this.admins.list(),
    ]);
    const adminCounts = new Map<string, number>();
    for (const admin of admins) {
      adminCounts.set(admin.householdId, (adminCounts.get(admin.householdId) ?? 0) + 1);
    }
    return householdsOverviewSchema.parse({
      households: households.map((household) => ({
        key: household.id,
        name: household.name,
        currency: household.currency,
        timezone: household.timezone,
        locale: localeOr(household.locale),
        memberCount: memberCounts.get(household.id) ?? 0,
        adminCount: adminCounts.get(household.id) ?? 0,
        isYours: household.id === actor.householdId,
        createdOn: dateOf(household.createdAt),
      })),
      options: {
        locales: LOCALES,
        currencies: COMMON_CURRENCIES.filter(isSupportedCurrency),
        defaultTimezone: DEFAULT_TIMEZONE,
      },
    });
  }

  async household(
    actor: RequestContext,
    householdId: string,
  ): Promise<HouseholdDetailView | undefined> {
    const household = await this.households.findHousehold(householdId);
    if (household === undefined) {
      return undefined;
    }
    const [members, access, identities, admins] = await Promise.all([
      this.households.listMembers(householdId),
      this.auth.accessStates(householdId),
      this.households.listWhatsAppIdentities(householdId),
      this.admins.list(),
    ]);
    const accessByMember = new Map(access.map((state) => [state.memberId, state]));
    const adminMembers = new Set(admins.map((admin) => admin.memberId));
    return householdDetailSchema.parse({
      key: household.id,
      name: household.name,
      currency: household.currency,
      timezone: household.timezone,
      locale: localeOr(household.locale),
      createdOn: dateOf(household.createdAt),
      members: members.map((member) => {
        const state = accessByMember.get(member.id);
        return {
          key: member.id,
          name: member.name,
          email: state?.email ?? null,
          hasPassword: state?.hasPassword ?? false,
          hasInvitation: state?.hasInvitation ?? false,
          isPlatformAdmin: adminMembers.has(member.id),
          isYou: member.id === actor.memberId,
          whatsapp: identities
            .filter((identity) => identity.memberId === member.id)
            .map((identity) => ({ key: identity.id, phoneNumber: identity.phoneNumber })),
        };
      }),
      options: { locales: LOCALES },
    });
  }

  async createHousehold(
    actor: RequestContext,
    request: NewHouseholdRequest,
  ): Promise<PlatformOutcome<CreatedView>> {
    if (!isSupportedCurrency(request.currency)) {
      return invalid('currency', 'UNKNOWN');
    }
    if (!isSupportedTimeZone(request.timezone)) {
      return invalid('timezone', 'UNKNOWN');
    }
    const household = await this.households.createHouseholdWithMembers(
      {
        name: request.name,
        currency: request.currency,
        timezone: request.timezone,
        locale: request.locale,
      },
      [request.firstMember],
    );
    await this.record(actor, 'HOUSEHOLD_CREATED', household.id);
    return done(createdSchema.parse({ key: household.id }));
  }

  async updateHousehold(
    actor: RequestContext,
    householdId: string,
    request: HouseholdSettingsRequest,
  ): Promise<PlatformOutcome> {
    if (!isSupportedTimeZone(request.timezone)) {
      return invalid('timezone', 'UNKNOWN');
    }
    const updated = await this.households.updateHousehold(householdId, request);
    if (updated === undefined) {
      return NOT_FOUND;
    }
    await this.record(actor, 'HOUSEHOLD_UPDATED', householdId);
    return done(undefined);
  }

  async addMember(
    actor: RequestContext,
    householdId: string,
    name: string,
  ): Promise<PlatformOutcome<CreatedView>> {
    if ((await this.households.findHousehold(householdId)) === undefined) {
      return NOT_FOUND;
    }
    const member = await this.households.addMember(householdId, name);
    await this.record(actor, 'MEMBER_ADDED', householdId, member.id);
    return done(createdSchema.parse({ key: member.id }));
  }

  async registerEmail(
    actor: RequestContext,
    householdId: string,
    memberId: string,
    email: string,
  ): Promise<PlatformOutcome> {
    if ((await this.households.findMember(householdId, memberId)) === undefined) {
      return NOT_FOUND;
    }
    if (!(await this.auth.registerEmail(householdId, memberId, email))) {
      return invalid('email', 'DUPLICATE');
    }
    await this.record(actor, 'EMAIL_REGISTERED', householdId, memberId);
    return done(undefined);
  }

  async issueInvitation(
    actor: RequestContext,
    householdId: string,
    memberId: string,
  ): Promise<InvitationView | undefined> {
    const member = await this.households.findMember(householdId, memberId);
    if (member === undefined) {
      return undefined;
    }
    const code = await this.auth.issueAccessCode(householdId, memberId);
    const state = (await this.auth.accessStates(householdId)).find(
      (entry) => entry.memberId === memberId,
    );
    await this.record(actor, 'INVITATION_ISSUED', householdId, memberId);
    return invitationSchema.parse({ member: member.name, code, email: state?.email ?? null });
  }

  async revokeAccess(
    actor: RequestContext,
    householdId: string,
    memberId: string,
  ): Promise<boolean> {
    if ((await this.households.findMember(householdId, memberId)) === undefined) {
      return false;
    }
    await this.auth.revokeAccess(householdId, memberId);
    await this.record(actor, 'ACCESS_REVOKED', householdId, memberId);
    return true;
  }

  async addWhatsAppIdentity(
    actor: RequestContext,
    householdId: string,
    memberId: string,
    request: WhatsAppIdentityRequest,
  ): Promise<PlatformOutcome<CreatedView>> {
    const registration = await this.whatsapp.register(householdId, memberId, request.phoneNumber);
    switch (registration.status) {
      case 'UNKNOWN_MEMBER':
        return NOT_FOUND;
      case 'ALREADY_REGISTERED':
        return invalid('phoneNumber', 'DUPLICATE');
      case 'REGISTERED':
        await this.record(actor, 'WHATSAPP_IDENTITY_ADDED', householdId, memberId);
        return done(createdSchema.parse({ key: registration.identity.id }));
    }
  }

  async removeWhatsAppIdentity(
    actor: RequestContext,
    householdId: string,
    identityId: string,
  ): Promise<boolean> {
    const removed = await this.households.removeWhatsAppIdentity(householdId, identityId);
    if (removed) {
      await this.record(actor, 'WHATSAPP_IDENTITY_REMOVED', householdId);
    }
    return removed;
  }

  async grantAdmin(
    actor: RequestContext,
    householdId: string,
    memberId: string,
  ): Promise<PlatformOutcome> {
    if ((await this.households.findMember(householdId, memberId)) === undefined) {
      return NOT_FOUND;
    }
    if (await this.admins.grant(householdId, memberId, actor.memberId)) {
      await this.record(actor, 'ADMIN_GRANTED', householdId, memberId);
    }
    return done(undefined);
  }

  async revokeAdmin(
    actor: RequestContext,
    householdId: string,
    memberId: string,
  ): Promise<PlatformOutcome> {
    if (!(await this.admins.isAdmin(householdId, memberId))) {
      return NOT_FOUND;
    }
    if ((await this.admins.count()) <= 1) {
      return invalid('form', 'NOT_ALLOWED');
    }
    await this.admins.revoke(householdId, memberId);
    await this.record(actor, 'ADMIN_REVOKED', householdId, memberId);
    return done(undefined);
  }

  private record(
    actor: RequestContext,
    action: PlatformAction,
    householdId?: string,
    memberId?: string,
  ): Promise<void> {
    return this.admins.record({ actorMemberId: actor.memberId, action, householdId, memberId });
  }
}

export type { Household };
