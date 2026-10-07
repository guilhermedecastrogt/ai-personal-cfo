import { z } from 'zod';
import { LOCALES } from '../i18n/locale.js';

export const PLATFORM_FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID',
  'UNKNOWN',
  'NOT_ALLOWED',
  'DUPLICATE',
] as const;

export const platformFieldErrorSchema = z.object({
  field: z.string(),
  code: z.enum(PLATFORM_FIELD_ERROR_CODES),
});

const localeSchema = z.enum(LOCALES);

export const householdSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  currency: z.string(),
  timezone: z.string(),
  locale: localeSchema,
  memberCount: z.number().int().nonnegative(),
  adminCount: z.number().int().nonnegative(),
  isYours: z.boolean(),
  createdOn: z.string(),
});

export const householdsOverviewSchema = z.object({
  households: z.array(householdSummarySchema),
  options: z.object({
    locales: z.array(localeSchema),
    currencies: z.array(z.string()),
    defaultTimezone: z.string(),
  }),
});

export const memberAccessSchema = z.object({
  key: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  hasPassword: z.boolean(),
  hasInvitation: z.boolean(),
  isPlatformAdmin: z.boolean(),
  isYou: z.boolean(),
  whatsapp: z.array(z.object({ key: z.string(), phoneNumber: z.string() })),
});

export const householdDetailSchema = z.object({
  key: z.string(),
  name: z.string(),
  currency: z.string(),
  timezone: z.string(),
  locale: localeSchema,
  createdOn: z.string(),
  members: z.array(memberAccessSchema),
  options: z.object({ locales: z.array(localeSchema) }),
});

export const createdSchema = z.object({ key: z.string() });

export const invitationSchema = z.object({
  member: z.string(),
  code: z.string(),
  email: z.string().nullable(),
});

export type PlatformFieldError = z.infer<typeof platformFieldErrorSchema>;
export type PlatformFieldErrorCode = (typeof PLATFORM_FIELD_ERROR_CODES)[number];
export type HouseholdSummaryView = z.infer<typeof householdSummarySchema>;
export type HouseholdsOverviewView = z.infer<typeof householdsOverviewSchema>;
export type MemberAccessView = z.infer<typeof memberAccessSchema>;
export type HouseholdDetailView = z.infer<typeof householdDetailSchema>;
export type CreatedView = z.infer<typeof createdSchema>;
export type InvitationView = z.infer<typeof invitationSchema>;
