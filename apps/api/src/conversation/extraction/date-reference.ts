import {
  WEEKDAYS,
  type DateReference,
} from '../../ai/interpretation/message-interpretation.schema.js';
import {
  addDays,
  daysBetween,
  daysInRange,
  monthContaining,
  weekContaining,
  type DateRange,
  type IsoDate,
} from '../../finance/domain/period/period.js';

const MAXIMUM_DAYS_AGO = 366;
const DAYS_PER_WEEK = 7;

export function resolveDateReference(
  reference: DateReference,
  today: IsoDate,
): IsoDate | undefined {
  switch (reference.kind) {
    case 'UNSPECIFIED':
    case 'TODAY':
      return today;
    case 'YESTERDAY':
      return addDays(today, -1);
    case 'DAYS_AGO':
      return resolveDaysAgo(reference.daysAgo, today);
    case 'WEEKDAY':
      return resolveWeekday(reference.weekday, today);
    case 'DAY_OF_MONTH':
      return resolveDayOfMonth(reference.dayOfMonth, today);
    case 'EXPLICIT_DATE':
      return resolveExplicitDate(reference.isoDate);
  }
}

function resolveDaysAgo(daysAgo: number | null, today: IsoDate): IsoDate | undefined {
  const isValid = daysAgo !== null && daysAgo >= 0 && daysAgo <= MAXIMUM_DAYS_AGO;
  return isValid ? addDays(today, -daysAgo) : undefined;
}

function resolveWeekday(weekday: DateReference['weekday'], today: IsoDate): IsoDate | undefined {
  if (weekday === null) {
    return undefined;
  }
  const todayIndex = daysBetween(weekContaining(today).start, today);
  const daysBack = (todayIndex - WEEKDAYS.indexOf(weekday) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(today, -daysBack);
}

function resolveDayOfMonth(dayOfMonth: number | null, today: IsoDate): IsoDate | undefined {
  if (dayOfMonth === null || dayOfMonth < 1) {
    return undefined;
  }
  const currentMonth = monthContaining(today);
  const previousMonth = monthContaining(addDays(currentMonth.start, -1));
  return [currentMonth, previousMonth]
    .map((month) => dayIn(month, dayOfMonth))
    .find((date) => date !== undefined && date <= today);
}

function dayIn(month: DateRange, dayOfMonth: number): IsoDate | undefined {
  return dayOfMonth <= daysInRange(month) ? addDays(month.start, dayOfMonth - 1) : undefined;
}

function resolveExplicitDate(isoDate: string | null): IsoDate | undefined {
  if (isoDate === null) {
    return undefined;
  }
  try {
    return addDays(isoDate, 0);
  } catch {
    return undefined;
  }
}
