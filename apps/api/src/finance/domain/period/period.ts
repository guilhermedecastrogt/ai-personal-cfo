export type IsoDate = string;

export interface DateRange {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

export type PeriodKind = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export class InvalidPeriodError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = InvalidPeriodError.name;
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONDAY_OFFSET_OF_EPOCH = 3;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;
const ISO_DATE_LENGTH = 10;

function toEpochDay(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (match === null) {
    throw new InvalidPeriodError(`Not an ISO calendar date: ${date}`);
  }
  const [, year, month, day] = match;
  const epochDay = Date.UTC(Number(year), Number(month) - 1, Number(day)) / MILLISECONDS_PER_DAY;
  if (fromEpochDay(epochDay) !== date) {
    throw new InvalidPeriodError(`Not a real calendar date: ${date}`);
  }
  return epochDay;
}

function fromEpochDay(epochDay: number): IsoDate {
  return new Date(epochDay * MILLISECONDS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
}

function yearOf(date: IsoDate): number {
  return new Date(toEpochDay(date) * MILLISECONDS_PER_DAY).getUTCFullYear();
}

function monthOf(date: IsoDate): number {
  return new Date(toEpochDay(date) * MILLISECONDS_PER_DAY).getUTCMonth() + 1;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

export function daysBetween(start: IsoDate, end: IsoDate): number {
  return toEpochDay(end) - toEpochDay(start);
}

export function dateRange(start: IsoDate, end: IsoDate): DateRange {
  if (daysBetween(start, end) < 0) {
    throw new InvalidPeriodError('A period cannot end before it starts');
  }
  return { start, end };
}

export function daysInRange(range: DateRange): number {
  return daysBetween(range.start, range.end) + 1;
}

export function contains(range: DateRange, date: IsoDate): boolean {
  return range.start <= date && date <= range.end;
}

export function calendarMonth(year: number, month: number): DateRange {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < FIRST_MONTH ||
    month > LAST_MONTH
  ) {
    throw new InvalidPeriodError('A calendar month needs an integer year and a month from 1 to 12');
  }
  const start = fromEpochDay(Date.UTC(year, month - 1, 1) / MILLISECONDS_PER_DAY);
  const end = fromEpochDay(Date.UTC(year, month, 0) / MILLISECONDS_PER_DAY);
  return { start, end };
}

export function monthContaining(date: IsoDate): DateRange {
  return calendarMonth(yearOf(date), monthOf(date));
}

export function yearContaining(date: IsoDate): DateRange {
  const year = yearOf(date);
  return {
    start: calendarMonth(year, FIRST_MONTH).start,
    end: calendarMonth(year, LAST_MONTH).end,
  };
}

export function weekContaining(date: IsoDate): DateRange {
  const epochDay = toEpochDay(date);
  const daysSinceMonday =
    (((epochDay + MONDAY_OFFSET_OF_EPOCH) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const start = fromEpochDay(epochDay - daysSinceMonday);
  return { start, end: addDays(start, DAYS_PER_WEEK - 1) };
}

export function periodContaining(kind: PeriodKind, date: IsoDate): DateRange {
  switch (kind) {
    case 'WEEKLY':
      return weekContaining(date);
    case 'MONTHLY':
      return monthContaining(date);
    case 'YEARLY':
      return yearContaining(date);
  }
}

export function previousPeriod(kind: PeriodKind, period: DateRange): DateRange {
  return periodContaining(kind, addDays(period.start, -1));
}

export function previousPeriods(kind: PeriodKind, period: DateRange, count: number): DateRange[] {
  const periods: DateRange[] = [];
  let current = period;
  for (let index = 0; index < count; index += 1) {
    current = previousPeriod(kind, current);
    periods.push(current);
  }
  return periods;
}

export function monthToDate(today: IsoDate): DateRange {
  return { start: monthContaining(today).start, end: today };
}

export function previousEquivalentRange(range: DateRange): DateRange {
  const month = monthContaining(range.start);
  const startsWithItsMonth = range.start === month.start && range.end <= month.end;
  if (!startsWithItsMonth) {
    const length = daysInRange(range);
    return { start: addDays(range.start, -length), end: addDays(range.start, -1) };
  }
  const previousMonth = monthContaining(addDays(month.start, -1));
  if (range.end === month.end) {
    return previousMonth;
  }
  const sameSpanEnd = addDays(previousMonth.start, daysBetween(range.start, range.end));
  return {
    start: previousMonth.start,
    end: sameSpanEnd < previousMonth.end ? sameSpanEnd : previousMonth.end,
  };
}

export function elapsedDays(period: DateRange, asOf: IsoDate): number {
  const elapsed = daysBetween(period.start, asOf) + 1;
  return Math.min(Math.max(elapsed, 0), daysInRange(period));
}

export function span(ranges: readonly DateRange[]): DateRange {
  const [first] = ranges;
  if (first === undefined) {
    throw new InvalidPeriodError('Cannot span an empty list of periods');
  }
  return ranges.reduce(
    (covering, range) => ({
      start: range.start < covering.start ? range.start : covering.start,
      end: range.end > covering.end ? range.end : covering.end,
    }),
    first,
  );
}

export function isSupportedTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function currentHourIn(timeZone: string, instant: Date): number {
  const hour = new Intl.DateTimeFormat('en', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(instant)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0);
}

export function currentDateIn(timeZone: string, instant: Date): IsoDate {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
