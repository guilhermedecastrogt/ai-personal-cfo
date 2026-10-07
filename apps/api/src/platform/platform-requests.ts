import { z } from 'zod';
import { LOCALES } from '../i18n/locale.js';
import type { PlatformFieldError } from './platform.contracts.js';

const MAXIMUM_NAME_LENGTH = 120;
const MAXIMUM_EMAIL_LENGTH = 254;
const MAXIMUM_TIMEZONE_LENGTH = 64;

const name = z.string().trim().min(1).max(MAXIMUM_NAME_LENGTH);
const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/);
const timezone = z.string().trim().min(1).max(MAXIMUM_TIMEZONE_LENGTH);
const locale = z.enum(LOCALES);
const email = z.string().trim().pipe(z.email().max(MAXIMUM_EMAIL_LENGTH));
const phoneNumber = z.string().trim().pipe(z.e164());
const optionalPhoneNumber = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  phoneNumber.optional(),
);

export const newHouseholdRequestSchema = z.object({
  name,
  currency: currencyCode,
  timezone,
  locale,
  firstMember: name,
  phoneNumber: optionalPhoneNumber,
});

export const householdSettingsRequestSchema = z.object({ name, timezone, locale });

export const newMemberRequestSchema = z.object({ name, phoneNumber: optionalPhoneNumber });

export const emailRequestSchema = z.object({ email });

export const whatsappIdentityRequestSchema = z.object({ phoneNumber });

export type NewHouseholdRequest = z.output<typeof newHouseholdRequestSchema>;
export type HouseholdSettingsRequest = z.output<typeof householdSettingsRequestSchema>;
export type NewMemberRequest = z.output<typeof newMemberRequestSchema>;
export type EmailRequest = z.output<typeof emailRequestSchema>;
export type WhatsAppIdentityRequest = z.output<typeof whatsappIdentityRequestSchema>;

export type ParsedPlatformRequest<Request> =
  | { readonly success: true; readonly data: Request }
  | { readonly success: false; readonly errors: PlatformFieldError[] };

export function parsePlatformRequest<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
): ParsedPlatformRequest<z.output<Schema>> {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  const provided =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const errors: PlatformFieldError[] = [];
  for (const issue of parsed.error.issues) {
    const [first] = issue.path;
    const field = typeof first === 'string' ? first : 'form';
    if (!seen.has(field)) {
      seen.add(field);
      errors.push({ field, code: provided[field] === undefined ? 'REQUIRED' : 'INVALID' });
    }
  }
  return { success: false, errors };
}
