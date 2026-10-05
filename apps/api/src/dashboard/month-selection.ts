import {
  calendarMonth,
  monthContaining,
  previousPeriod,
  type DateRange,
  type IsoDate,
} from '../finance/domain/period/period.js';

export interface SelectedMonth {
  readonly key: string;
  readonly label: string;
  readonly period: DateRange;
  readonly asOf: IsoDate;
  readonly isComplete: boolean;
}

export class InvalidMonthError extends Error {
  constructor() {
    super('The month is not valid or has not started');
    this.name = InvalidMonthError.name;
  }
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_KEY_LENGTH = 7;
const MAXIMUM_LISTED_MONTHS = 36;

const LABEL_FORMAT = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function keyOf(period: DateRange): string {
  return period.start.slice(0, MONTH_KEY_LENGTH);
}

function labelOf(period: DateRange): string {
  return LABEL_FORMAT.format(new Date(`${period.start}T00:00:00Z`));
}

export function selectMonth(key: string | undefined, today: IsoDate): SelectedMonth {
  const period = key === undefined ? monthContaining(today) : parseMonth(key);
  if (period.start > today) {
    throw new InvalidMonthError();
  }
  const isComplete = period.end <= today;
  return {
    key: keyOf(period),
    label: labelOf(period),
    period,
    asOf: isComplete ? period.end : today,
    isComplete,
  };
}

export function listMonths(
  earliestDate: IsoDate | undefined,
  today: IsoDate,
): { key: string; label: string }[] {
  const earliest = monthContaining(earliestDate ?? today).start;
  const months: { key: string; label: string }[] = [];
  let month = monthContaining(today);
  while (month.start >= earliest && months.length < MAXIMUM_LISTED_MONTHS) {
    months.push({ key: keyOf(month), label: labelOf(month) });
    month = previousPeriod('MONTHLY', month);
  }
  return months;
}

function parseMonth(key: string): DateRange {
  const match = MONTH_KEY.exec(key);
  if (match === null) {
    throw new InvalidMonthError();
  }
  return calendarMonth(Number(match[1]), Number(match[2]));
}
