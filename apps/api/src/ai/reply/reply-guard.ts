import type { ReplyFacts } from '../ai-provider.js';

const NUMERIC_TOKEN = /\d+(?:[.,]\d+)*/g;
const DECIMAL_PART = /^(.*)[.,](\d{1,2})$/;
const SEPARATORS = /[.,]/g;

export function canonicalFigure(token: string): string {
  const match = DECIMAL_PART.exec(token);
  const whole = (match?.[1] ?? token).replace(SEPARATORS, '').replace(/^0+(?=\d)/, '');
  const fraction = (match?.[2] ?? '').replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

export function figuresIn(text: string): Set<string> {
  return new Set((text.match(NUMERIC_TOKEN) ?? []).map(canonicalFigure));
}

export function findUnverifiedFigures(
  reply: string,
  facts: ReplyFacts,
  userMessage: string,
): string[] {
  const verified = new Set([...figuresIn(JSON.stringify(facts)), ...figuresIn(userMessage)]);
  return [...figuresIn(reply)].filter((figure) => !verified.has(figure));
}
