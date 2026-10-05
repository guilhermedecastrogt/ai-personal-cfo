export type RecurrenceFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface RecurrenceCadence {
  readonly frequency: RecurrenceFrequency;
  readonly intervalInDays: number;
  readonly toleranceInDays: number;
}

export interface FinancePolicy {
  readonly forecast: {
    readonly historyPeriods: number;
  };
  readonly recurring: {
    readonly lookbackInDays: number;
    readonly minimumOccurrences: number;
    readonly amountToleranceBasisPoints: number;
    readonly missedCyclesBeforeStale: number;
    readonly cadences: readonly RecurrenceCadence[];
  };
  readonly anomaly: {
    readonly lookbackInDays: number;
    readonly minimumSamples: number;
    readonly largeTransactionRatioBasisPoints: number;
    readonly baselinePeriods: number;
    readonly minimumBaselinePeriods: number;
    readonly categorySpendingRatioBasisPoints: number;
    readonly minimumDifferenceMinor: number;
  };
  readonly insights: {
    readonly criticalBudgetUsageBasisPoints: number;
    readonly spendingIncreaseBasisPoints: number;
    readonly sharpSpendingIncreaseBasisPoints: number;
    readonly minimumSpendingIncreaseMinor: number;
  };
  readonly review: {
    readonly healthySavingsRateBasisPoints: number;
    readonly lowSavingsRateBasisPoints: number;
    readonly topCategories: number;
    readonly categoryChanges: number;
  };
}

export const DEFAULT_FINANCE_POLICY: FinancePolicy = {
  forecast: {
    historyPeriods: 3,
  },
  recurring: {
    lookbackInDays: 400,
    minimumOccurrences: 3,
    amountToleranceBasisPoints: 1_000,
    missedCyclesBeforeStale: 2,
    cadences: [
      { frequency: 'WEEKLY', intervalInDays: 7, toleranceInDays: 1 },
      { frequency: 'MONTHLY', intervalInDays: 30, toleranceInDays: 3 },
      { frequency: 'QUARTERLY', intervalInDays: 91, toleranceInDays: 4 },
      { frequency: 'YEARLY', intervalInDays: 365, toleranceInDays: 5 },
    ],
  },
  anomaly: {
    lookbackInDays: 180,
    minimumSamples: 5,
    largeTransactionRatioBasisPoints: 30_000,
    baselinePeriods: 3,
    minimumBaselinePeriods: 2,
    categorySpendingRatioBasisPoints: 15_000,
    minimumDifferenceMinor: 5_000,
  },
  insights: {
    criticalBudgetUsageBasisPoints: 15_000,
    spendingIncreaseBasisPoints: 2_500,
    sharpSpendingIncreaseBasisPoints: 5_000,
    minimumSpendingIncreaseMinor: 2_000,
  },
  review: {
    healthySavingsRateBasisPoints: 2_000,
    lowSavingsRateBasisPoints: 500,
    topCategories: 5,
    categoryChanges: 3,
  },
};
