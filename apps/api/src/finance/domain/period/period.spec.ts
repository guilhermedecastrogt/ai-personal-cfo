import {
  InvalidPeriodError,
  addDays,
  calendarMonth,
  contains,
  currentDateIn,
  dateRange,
  daysBetween,
  daysInRange,
  elapsedDays,
  isSupportedTimeZone,
  monthContaining,
  monthToDate,
  periodContaining,
  previousEquivalentRange,
  previousPeriod,
  previousPeriods,
  span,
  weekContaining,
  yearContaining,
} from './period.js';

describe('calendar months', () => {
  it.each([
    [2026, 10, '2026-10-01', '2026-10-31'],
    [2026, 2, '2026-02-01', '2026-02-28'],
    [2028, 2, '2028-02-01', '2028-02-29'],
    [2026, 12, '2026-12-01', '2026-12-31'],
  ])('%d-%d runs from %s to %s', (year, month, start, end) => {
    expect(calendarMonth(year, month)).toEqual({ start, end });
  });

  it.each([0, 13, 1.5])('rejects month %d', (month) => {
    expect(() => calendarMonth(2026, month)).toThrow(InvalidPeriodError);
  });

  it('finds the month containing a date', () => {
    expect(monthContaining('2026-10-05')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('runs month to date from the first day to today', () => {
    expect(monthToDate('2026-10-05')).toEqual({ start: '2026-10-01', end: '2026-10-05' });
  });
});

describe('weeks and years', () => {
  it.each([
    ['2026-10-05', '2026-10-05', '2026-10-11'],
    ['2026-10-11', '2026-10-05', '2026-10-11'],
    ['2026-10-07', '2026-10-05', '2026-10-11'],
    ['2026-01-01', '2025-12-29', '2026-01-04'],
    ['1969-12-31', '1969-12-29', '1970-01-04'],
  ])('the week containing %s runs Monday %s to Sunday %s', (date, start, end) => {
    expect(weekContaining(date)).toEqual({ start, end });
  });

  it('finds the year containing a date', () => {
    expect(yearContaining('2026-10-05')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('selects the period for a budget period kind', () => {
    expect(periodContaining('WEEKLY', '2026-10-07').start).toBe('2026-10-05');
    expect(periodContaining('MONTHLY', '2026-10-07').start).toBe('2026-10-01');
    expect(periodContaining('YEARLY', '2026-10-07').start).toBe('2026-01-01');
  });
});

describe('previous periods', () => {
  it('steps back one calendar period of the same kind', () => {
    expect(previousPeriod('MONTHLY', calendarMonth(2026, 3))).toEqual(calendarMonth(2026, 2));
    expect(previousPeriod('MONTHLY', calendarMonth(2026, 1))).toEqual(calendarMonth(2025, 12));
    expect(previousPeriod('WEEKLY', weekContaining('2026-10-05')).start).toBe('2026-09-28');
    expect(previousPeriod('YEARLY', yearContaining('2026-10-05')).start).toBe('2025-01-01');
  });

  it('lists several previous periods, most recent first', () => {
    expect(previousPeriods('MONTHLY', calendarMonth(2026, 2), 3)).toEqual([
      calendarMonth(2026, 1),
      calendarMonth(2025, 12),
      calendarMonth(2025, 11),
    ]);
  });
});

describe('previousEquivalentRange', () => {
  it('compares a full month with the full previous month', () => {
    expect(previousEquivalentRange(calendarMonth(2026, 3))).toEqual(calendarMonth(2026, 2));
  });

  it('compares month to date with the same days of the previous month', () => {
    expect(previousEquivalentRange(monthToDate('2026-10-05'))).toEqual({
      start: '2026-09-01',
      end: '2026-09-05',
    });
  });

  it('clamps to the end of a shorter previous month', () => {
    expect(previousEquivalentRange(monthToDate('2026-03-30'))).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('shifts an arbitrary range back by its own length', () => {
    expect(previousEquivalentRange({ start: '2026-10-10', end: '2026-10-16' })).toEqual({
      start: '2026-10-03',
      end: '2026-10-09',
    });
  });

  it('shifts a range that spans months back by its own length', () => {
    expect(previousEquivalentRange({ start: '2026-10-01', end: '2026-11-15' })).toEqual({
      start: '2026-08-16',
      end: '2026-09-30',
    });
  });
});

describe('date arithmetic', () => {
  it('adds and subtracts days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is unaffected by daylight saving changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('counts both ends of a range', () => {
    expect(daysInRange({ start: '2026-10-01', end: '2026-10-31' })).toBe(31);
    expect(daysInRange({ start: '2026-10-05', end: '2026-10-05' })).toBe(1);
  });

  it('treats both ends of a range as inside it', () => {
    const range = dateRange('2026-10-01', '2026-10-31');

    expect(contains(range, '2026-10-01')).toBe(true);
    expect(contains(range, '2026-10-31')).toBe(true);
    expect(contains(range, '2026-09-30')).toBe(false);
    expect(contains(range, '2026-11-01')).toBe(false);
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => dateRange('2026-10-05', '2026-10-04')).toThrow(InvalidPeriodError);
  });

  it.each(['2026-02-30', '2026-13-01', '05/10/2026', '2026-1-5', ''])(
    'rejects "%s" as a date',
    (date) => {
      expect(() => addDays(date, 0)).toThrow(InvalidPeriodError);
    },
  );

  it('counts elapsed days including the current day and never beyond the period', () => {
    const october = calendarMonth(2026, 10);

    expect(elapsedDays(october, '2026-09-30')).toBe(0);
    expect(elapsedDays(october, '2026-10-01')).toBe(1);
    expect(elapsedDays(october, '2026-10-05')).toBe(5);
    expect(elapsedDays(october, '2026-10-31')).toBe(31);
    expect(elapsedDays(october, '2026-11-15')).toBe(31);
  });

  it('spans the earliest start to the latest end', () => {
    expect(span([calendarMonth(2026, 10), calendarMonth(2026, 8), calendarMonth(2026, 9)])).toEqual(
      {
        start: '2026-08-01',
        end: '2026-10-31',
      },
    );
    expect(() => span([])).toThrow(InvalidPeriodError);
  });
});

describe('time zones', () => {
  const instant = new Date('2026-10-31T23:30:00Z');

  it('gives the calendar date in the requested time zone', () => {
    expect(currentDateIn('UTC', instant)).toBe('2026-10-31');
    expect(currentDateIn('Europe/Dublin', instant)).toBe('2026-10-31');
    expect(currentDateIn('Asia/Tokyo', instant)).toBe('2026-11-01');
    expect(currentDateIn('America/Sao_Paulo', instant)).toBe('2026-10-31');
  });

  it('puts the same instant in different months for different households', () => {
    expect(monthContaining(currentDateIn('Asia/Tokyo', instant)).start).toBe('2026-11-01');
    expect(monthContaining(currentDateIn('America/Sao_Paulo', instant)).start).toBe('2026-10-01');
  });

  it('recognises IANA time zone names', () => {
    expect(isSupportedTimeZone('Europe/Dublin')).toBe(true);
    expect(isSupportedTimeZone('Mars/Olympus')).toBe(false);
  });
});
