import type { DateReference } from '../../ai/interpretation/message-interpretation.schema.js';
import { resolveDateReference } from './date-reference.js';

const TUESDAY = '2026-10-20';

function reference(overrides: Partial<DateReference>): DateReference {
  return {
    kind: 'UNSPECIFIED',
    daysAgo: null,
    weekday: null,
    dayOfMonth: null,
    isoDate: null,
    ...overrides,
  };
}

function resolve(overrides: Partial<DateReference>, today = TUESDAY): string | undefined {
  return resolveDateReference(reference(overrides), today);
}

describe('resolveDateReference', () => {
  it('takes a message without a date to be about the day it was sent', () => {
    expect(resolve({ kind: 'UNSPECIFIED' })).toBe('2026-10-20');
  });

  it('resolves today and yesterday from the reference date', () => {
    expect(resolve({ kind: 'TODAY' })).toBe('2026-10-20');
    expect(resolve({ kind: 'YESTERDAY' })).toBe('2026-10-19');
    expect(resolve({ kind: 'YESTERDAY' }, '2026-03-01')).toBe('2026-02-28');
  });

  it('counts days back', () => {
    expect(resolve({ kind: 'DAYS_AGO', daysAgo: 3 })).toBe('2026-10-17');
    expect(resolve({ kind: 'DAYS_AGO', daysAgo: 0 })).toBe('2026-10-20');
  });

  it.each([null, -1, 400])('cannot resolve %s days ago', (daysAgo) => {
    expect(resolve({ kind: 'DAYS_AGO', daysAgo })).toBeUndefined();
  });

  it.each([
    ['FRIDAY', '2026-10-16'],
    ['MONDAY', '2026-10-19'],
    ['TUESDAY', '2026-10-20'],
    ['WEDNESDAY', '2026-10-14'],
    ['SUNDAY', '2026-10-18'],
  ] as const)('resolves %s to the most recent one, today included', (weekday, expected) => {
    expect(resolve({ kind: 'WEEKDAY', weekday })).toBe(expected);
  });

  it('cannot resolve a weekday reference without a weekday', () => {
    expect(resolve({ kind: 'WEEKDAY' })).toBeUndefined();
  });

  it('resolves a day of the month to the most recent such day', () => {
    expect(resolve({ kind: 'DAY_OF_MONTH', dayOfMonth: 3 })).toBe('2026-10-03');
    expect(resolve({ kind: 'DAY_OF_MONTH', dayOfMonth: 20 })).toBe('2026-10-20');
    expect(resolve({ kind: 'DAY_OF_MONTH', dayOfMonth: 25 })).toBe('2026-09-25');
  });

  it('cannot resolve a day that the candidate months do not have', () => {
    expect(resolve({ kind: 'DAY_OF_MONTH', dayOfMonth: 31 }, '2026-03-15')).toBeUndefined();
    expect(resolve({ kind: 'DAY_OF_MONTH', dayOfMonth: 0 })).toBeUndefined();
    expect(resolve({ kind: 'DAY_OF_MONTH', dayOfMonth: null })).toBeUndefined();
  });

  it('accepts a complete explicit date', () => {
    expect(resolve({ kind: 'EXPLICIT_DATE', isoDate: '2026-09-30' })).toBe('2026-09-30');
  });

  it.each([null, '30/09/2026', '2026-02-30', 'yesterday'])(
    'cannot resolve the explicit date %s',
    (isoDate) => {
      expect(resolve({ kind: 'EXPLICIT_DATE', isoDate })).toBeUndefined();
    },
  );

  it('depends only on the reference date it is given', () => {
    expect(resolve({ kind: 'YESTERDAY' }, '2020-01-01')).toBe('2019-12-31');
  });
});
