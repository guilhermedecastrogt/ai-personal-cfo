import { readTransactionQuery, withoutRange } from './transaction-query';

describe('readTransactionQuery', () => {
  it('keeps the filters, the text and a valid period and order', () => {
    expect(
      readTransactionQuery({
        type: 'EXPENSE',
        q: '  five guys ',
        from: '2026-09-01',
        to: '2026-10-31',
        sort: 'amount_desc',
      }),
    ).toEqual({
      type: 'EXPENSE',
      category: undefined,
      account: undefined,
      member: undefined,
      q: 'five guys',
      from: '2026-09-01',
      to: '2026-10-31',
      sort: 'amount_desc',
    });
  });

  it('drops what the API would refuse', () => {
    expect(
      readTransactionQuery({ q: '   ', from: '01/09/2026', to: '2026-13', sort: 'random' }),
    ).toMatchObject({ q: undefined, from: undefined, to: undefined, sort: undefined });
  });

  it('keeps no more than a hundred characters of text', () => {
    expect(readTransactionQuery({ q: 'x'.repeat(150) }).q).toHaveLength(100);
  });

  it('can forget the period and keep everything else', () => {
    expect(withoutRange({ q: 'lidl', from: '2026-01-01', to: '2026-12-31' })).toEqual({
      q: 'lidl',
      from: undefined,
      to: undefined,
    });
  });
});
