import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.js';
import type { ReplyFacts, ReplySituation } from '../ai-provider.js';

const HEADLINES: Readonly<Record<Locale, Readonly<Record<ReplySituation, string>>>> = {
  en: {
    TRANSACTION_RECORDED: 'Recorded.',
    CLARIFICATION_NEEDED: 'I need a bit more information before I can continue.',
    QUESTION_ANSWERED: 'Here is what I found.',
    IMAGE_NOT_USABLE: 'I could not record anything from that image.',
    EDIT_NOT_SUPPORTED:
      'I cannot change or delete a recorded transaction yet. Nothing was changed.',
    WELCOME:
      'Welcome. I am your household CFO on WhatsApp: tell me what you spend or receive, send a photo of a receipt, or ask me about your money.',
    PROACTIVE_NOTIFICATION: 'A note about your household finances.',
    OUT_OF_SCOPE:
      'I can record expenses and income, and answer questions about spending, budgets, goals and balances.',
  },
  'pt-BR': {
    TRANSACTION_RECORDED: 'Registrado.',
    CLARIFICATION_NEEDED: 'Preciso de um pouco mais de informação para continuar.',
    QUESTION_ANSWERED: 'Aqui está o que encontrei.',
    IMAGE_NOT_USABLE: 'Não consegui registrar nada a partir dessa imagem.',
    EDIT_NOT_SUPPORTED:
      'Por aqui ainda não consigo alterar ou apagar um lançamento. Nada foi alterado.',
    WELCOME:
      'Seja bem-vindo. Sou o CFO da sua casa no WhatsApp: me conte o que gastou ou recebeu, envie a foto de um recibo ou pergunte sobre as suas finanças.',
    PROACTIVE_NOTIFICATION: 'Uma observação sobre as finanças da casa.',
    OUT_OF_SCOPE:
      'Posso registrar gastos e receitas e responder sobre gastos, orçamentos, metas e saldos.',
  },
};

const UNAVAILABLE: Readonly<Record<Locale, string>> = {
  en: 'I could not process that right now. Nothing was recorded. Please try again in a moment.',
  'pt-BR': 'Não consegui processar isso agora. Nada foi registrado. Tente novamente em instantes.',
};

export const AI_UNAVAILABLE_REPLY = UNAVAILABLE.en;

export function aiUnavailableReply(locale: Locale = DEFAULT_LOCALE): string {
  return UNAVAILABLE[locale];
}

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

export function renderFallbackReply(
  situation: ReplySituation,
  facts: ReplyFacts,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const details = Object.entries(facts).flatMap(([key, value]) => describe(value, key, 0));
  return [HEADLINES[locale][situation], ...details].join('\n');
}
