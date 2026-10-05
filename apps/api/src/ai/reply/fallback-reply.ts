import type { ReplyFacts, ReplySituation } from '../ai-provider.js';

const HEADLINES: Record<ReplySituation, string> = {
  TRANSACTION_RECORDED: 'Recorded.',
  CLARIFICATION_NEEDED: 'I need a bit more information before I can continue.',
  QUESTION_ANSWERED: 'Here is what I found.',
  IMAGE_NOT_USABLE: 'I could not record anything from that image.',
  EDIT_NOT_SUPPORTED: 'I cannot change or delete a recorded transaction yet. Nothing was changed.',
  OUT_OF_SCOPE:
    'I can record expenses and income, and answer questions about spending, budgets, goals and balances.',
};

export const AI_UNAVAILABLE_REPLY =
  'I could not process that right now. Nothing was recorded. Please try again in a moment.';

function describe(value: unknown, label: string, depth: number): string[] {
  const indent = '  '.repeat(depth);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [`${indent}${label}: ${String(value)}`];
  }
  if (Array.isArray(value)) {
    return withLabel(
      indent,
      label,
      value.flatMap((item, index) => describe(item, String(index + 1), depth + 1)),
    );
  }
  if (typeof value === 'object' && value !== null) {
    return withLabel(
      indent,
      label,
      Object.entries(value).flatMap(([key, field]) => describe(field, key, depth + 1)),
    );
  }
  return [];
}

function withLabel(indent: string, label: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : [`${indent}${label}:`, ...lines];
}

export function renderFallbackReply(situation: ReplySituation, facts: ReplyFacts): string {
  const details = Object.entries(facts).flatMap(([key, value]) => describe(value, key, 0));
  return [HEADLINES[situation], ...details].join('\n');
}
