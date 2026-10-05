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
