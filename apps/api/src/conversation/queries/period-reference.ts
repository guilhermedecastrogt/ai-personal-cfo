import type { PeriodReference } from '../../ai/interpretation/message-interpretation.schema.js';
import {
  addDays,
  calendarMonth,
  monthContaining,
  periodContaining,
  previousPeriod,
  yearContaining,
  type DateRange,
  type IsoDate,
} from '../../finance/domain/period/period.js';

const MAXIMUM_DAYS = 366;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;

export function resolvePeriodReference(
  reference: PeriodReference,
  today: IsoDate,
): DateRange | undefined {
  switch (reference.kind) {
    case 'UNSPECIFIED':
    case 'CURRENT_MONTH':
      return monthContaining(today);
    case 'PREVIOUS_MONTH':
      return previousPeriod('MONTHLY', monthContaining(today));
    case 'CURRENT_WEEK':
      return periodContaining('WEEKLY', today);
    case 'PREVIOUS_WEEK':
      return previousPeriod('WEEKLY', periodContaining('WEEKLY', today));
    case 'CURRENT_YEAR':
      return yearContaining(today);
    case 'LAST_DAYS':
      return resolveLastDays(reference.days, today);
    case 'SPECIFIC_MONTH':
      return resolveSpecificMonth(reference.year, reference.month, today);
  }
}

function resolveLastDays(days: number | null, today: IsoDate): DateRange | undefined {
  const isValid = days !== null && days >= 1 && days <= MAXIMUM_DAYS;
  return isValid ? { start: addDays(today, -(days - 1)), end: today } : undefined;
}

function resolveSpecificMonth(
  year: number | null,
  month: number | null,
  today: IsoDate,
): DateRange | undefined {
  if (month === null || month < FIRST_MONTH || month > LAST_MONTH) {
    return undefined;
  }
  const currentYear = Number(yearContaining(today).start.slice(0, 4));
  if (year !== null) {
    return calendarMonth(year, month);
  }
  const thisYear = calendarMonth(currentYear, month);
  return thisYear.start <= today ? thisYear : calendarMonth(currentYear - 1, month);
}
