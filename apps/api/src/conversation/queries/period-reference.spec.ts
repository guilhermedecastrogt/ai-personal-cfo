import type { PeriodReference } from '../../ai/interpretation/message-interpretation.schema.js';
import { resolvePeriodReference } from './period-reference.js';

const TODAY = '2026-10-20';

function resolve(
  overrides: Partial<PeriodReference>,
  today = TODAY,
): ReturnType<typeof resolvePeriodReference> {
  return resolvePeriodReference(
    { kind: 'UNSPECIFIED', days: null, year: null, month: null, ...overrides },
    today,
  );
}

describe('resolvePeriodReference', () => {
  it('takes a question without a period to be about the current month', () => {
    expect(resolve({ kind: 'UNSPECIFIED' })).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it.each([
    ['CURRENT_MONTH', '2026-10-01', '2026-10-31'],
    ['PREVIOUS_MONTH', '2026-09-01', '2026-09-30'],
    ['CURRENT_WEEK', '2026-10-19', '2026-10-25'],
    ['PREVIOUS_WEEK', '2026-10-12', '2026-10-18'],
    ['CURRENT_YEAR', '2026-01-01', '2026-12-31'],
  ] as const)('resolves %s to %s through %s', (kind, start, end) => {
    expect(resolve({ kind })).toEqual({ start, end });
  });

  it('resolves the previous month across a year boundary', () => {
    expect(resolve({ kind: 'PREVIOUS_MONTH' }, '2026-01-15')).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });

  it('resolves the last days ending today', () => {
    expect(resolve({ kind: 'LAST_DAYS', days: 7 })).toEqual({
      start: '2026-10-14',
      end: '2026-10-20',
    });
    expect(resolve({ kind: 'LAST_DAYS', days: 1 })).toEqual({
      start: '2026-10-20',
      end: '2026-10-20',
    });
  });

  it.each([null, 0, -3, 1000])('cannot resolve the last %s days', (days) => {
    expect(resolve({ kind: 'LAST_DAYS', days })).toBeUndefined();
  });

  it('resolves a month with its year', () => {
    expect(resolve({ kind: 'SPECIFIC_MONTH', month: 2, year: 2024 })).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    });
  });

  it('resolves a month without a year to its most recent occurrence', () => {
    expect(resolve({ kind: 'SPECIFIC_MONTH', month: 3 })).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
    expect(resolve({ kind: 'SPECIFIC_MONTH', month: 10 })?.start).toBe('2026-10-01');
    expect(resolve({ kind: 'SPECIFIC_MONTH', month: 12 })).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });

  it.each([null, 0, 13])('cannot resolve month %s', (month) => {
    expect(resolve({ kind: 'SPECIFIC_MONTH', month })).toBeUndefined();
  });
});
