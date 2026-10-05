import {
  resolveMentionedAccount,
  resolveUnmentionedAccount,
  type AccountOption,
} from './account-resolution.js';

const A_REVOLUT = {
  id: 'a-revolut',
  name: 'Member A Revolut',
  currency: 'EUR',
  ownerMemberId: 'a',
};
const A_BANK = { id: 'a-bank', name: 'Member A Bank', currency: 'EUR', ownerMemberId: 'a' };
const B_REVOLUT = {
  id: 'b-revolut',
  name: 'Member B Revolut',
  currency: 'EUR',
  ownerMemberId: 'b',
};
const JOINT = { id: 'joint', name: 'Joint Account', currency: 'EUR', ownerMemberId: null };
const ACCOUNTS: AccountOption[] = [A_REVOLUT, A_BANK, B_REVOLUT, JOINT];

describe('resolveMentionedAccount', () => {
  it('resolves an exact name regardless of case and spacing', () => {
    expect(resolveMentionedAccount('  joint   ACCOUNT ', ACCOUNTS, 'a')).toEqual({
      status: 'RESOLVED',
      account: JOINT,
    });
  });

  it('resolves a partial name that matches one account', () => {
    expect(resolveMentionedAccount('joint', ACCOUNTS, 'a')).toEqual({
      status: 'RESOLVED',
      account: JOINT,
    });
  });

  it('prefers the account of the sender when several match', () => {
    expect(resolveMentionedAccount('revolut', ACCOUNTS, 'a')).toEqual({
      status: 'RESOLVED',
      account: A_REVOLUT,
    });
    expect(resolveMentionedAccount('revolut', ACCOUNTS, 'b')).toEqual({
      status: 'RESOLVED',
      account: B_REVOLUT,
    });
  });

  it('is ambiguous when several match and the sender owns none or several of them', () => {
    expect(resolveMentionedAccount('revolut', ACCOUNTS, 'c')).toEqual({ status: 'AMBIGUOUS' });
    expect(resolveMentionedAccount('member a', ACCOUNTS, 'a')).toEqual({ status: 'AMBIGUOUS' });
  });

  it('is unknown when nothing matches', () => {
    expect(resolveMentionedAccount('savings', ACCOUNTS, 'a')).toEqual({ status: 'UNKNOWN' });
    expect(resolveMentionedAccount('   ', ACCOUNTS, 'a')).toEqual({ status: 'UNKNOWN' });
  });
});

describe('resolveUnmentionedAccount', () => {
  const A_REAIS = { id: 'a-reais', name: 'Member A Inter', currency: 'BRL', ownerMemberId: 'a' };
  const B_REAIS = { id: 'b-reais', name: 'Member B Inter', currency: 'BRL', ownerMemberId: 'b' };
  const JOINT_REAIS = {
    id: 'joint-reais',
    name: 'Joint Reais',
    currency: 'BRL',
    ownerMemberId: null,
  };

  it('uses the only account in the stated currency when the default account is in another', () => {
    expect(
      resolveUnmentionedAccount([...ACCOUNTS, A_REAIS], A_BANK, { currency: 'BRL', senderId: 'a' }),
    ).toEqual({ status: 'RESOLVED', account: A_REAIS });
  });

  it('prefers the sender’s own account, then a joint one, in the stated currency', () => {
    expect(
      resolveUnmentionedAccount([A_REAIS, B_REAIS, JOINT_REAIS], A_BANK, {
        currency: 'BRL',
        senderId: 'a',
      }),
    ).toEqual({ status: 'RESOLVED', account: A_REAIS });
    expect(
      resolveUnmentionedAccount([B_REAIS, JOINT_REAIS], A_BANK, { currency: 'BRL', senderId: 'a' }),
    ).toEqual({ status: 'RESOLVED', account: JOINT_REAIS });
  });

  it('keeps the default account when it is already in the stated currency', () => {
    expect(
      resolveUnmentionedAccount([...ACCOUNTS, A_REAIS], A_BANK, { currency: 'EUR', senderId: 'a' }),
    ).toEqual({ status: 'RESOLVED', account: A_BANK });
  });

  it('falls back to the default account when no account holds the stated currency', () => {
    expect(resolveUnmentionedAccount(ACCOUNTS, A_BANK, { currency: 'GBP', senderId: 'a' })).toEqual(
      { status: 'RESOLVED', account: A_BANK },
    );
  });

  it('uses the default account of the sender', () => {
    expect(resolveUnmentionedAccount(ACCOUNTS, A_BANK)).toEqual({
      status: 'RESOLVED',
      account: A_BANK,
    });
  });

  it('uses the only account of a household that has one', () => {
    expect(resolveUnmentionedAccount([JOINT], undefined)).toEqual({
      status: 'RESOLVED',
      account: JOINT,
    });
  });

  it('does not guess between several accounts', () => {
    expect(resolveUnmentionedAccount(ACCOUNTS, undefined)).toEqual({ status: 'AMBIGUOUS' });
  });

  it('is unknown when the household has no account', () => {
    expect(resolveUnmentionedAccount([], undefined)).toEqual({ status: 'UNKNOWN' });
  });
});
