export const WELCOME_RESULTS = ['SENT', 'FAILED', 'DISABLED', 'NO_NUMBER'] as const;

export type WelcomeResult = (typeof WELCOME_RESULTS)[number];
