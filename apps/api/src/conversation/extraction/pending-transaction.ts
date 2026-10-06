import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';

export function completePendingCandidate(
  pending: TransactionCandidate,
  update: TransactionCandidate,
): TransactionCandidate {
  return {
    type: update.type ?? pending.type,
    amount: stated(update.amount) ?? pending.amount,
    currency: stated(update.currency) ?? pending.currency,
    merchant: stated(update.merchant) ?? pending.merchant,
    description: stated(update.description) ?? pending.description,
    category: stated(update.category) ?? pending.category,
    account: stated(update.account) ?? pending.account,
    transferAccount: stated(update.transferAccount) ?? pending.transferAccount,
    member: stated(update.member) ?? pending.member,
    memberReference:
      stated(update.member) === null ? pending.memberReference : update.memberReference,
    paymentMethod: update.paymentMethod ?? pending.paymentMethod,
    date: update.date.kind === 'UNSPECIFIED' ? pending.date : update.date,
    confidence: update.confidence,
  };
}

function stated(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value;
}
