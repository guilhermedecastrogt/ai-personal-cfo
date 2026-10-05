import { InvalidGoalError, calculateGoalProgress, type GoalDefinition } from './goal-progress.js';

const TRIP: GoalDefinition = {
  id: 'goal-trip',
  currency: 'EUR',
  targetAmountMinor: 100000,
  currentAmountMinor: 62000,
  targetDate: null,
};

describe('calculateGoalProgress', () => {
  it('reports partial progress', () => {
    expect(calculateGoalProgress(TRIP, '2026-10-05')).toEqual({
      goalId: 'goal-trip',
      currency: 'EUR',
      targetMinor: 100000,
      currentMinor: 62000,
      remainingMinor: 38000,
      progressBasisPoints: 6200,
      state: 'IN_PROGRESS',
      targetDate: null,
      daysRemaining: null,
      requiredMonthlyMinor: null,
    });
  });

  it('reports zero progress', () => {
    const progress = calculateGoalProgress({ ...TRIP, currentAmountMinor: 0 }, '2026-10-05');

    expect(progress).toMatchObject({
      remainingMinor: 100000,
      progressBasisPoints: 0,
      state: 'IN_PROGRESS',
    });
  });

  it('is completed exactly at the target', () => {
    const progress = calculateGoalProgress({ ...TRIP, currentAmountMinor: 100000 }, '2026-10-05');

    expect(progress).toMatchObject({
      remainingMinor: 0,
      progressBasisPoints: 10000,
      state: 'COMPLETED',
    });
  });

  it('never reports a negative remainder when the target is surpassed', () => {
    const progress = calculateGoalProgress({ ...TRIP, currentAmountMinor: 125000 }, '2026-10-05');

    expect(progress).toMatchObject({
      remainingMinor: 0,
      progressBasisPoints: 12500,
      state: 'COMPLETED',
    });
  });

  it('is overdue after its target date while incomplete', () => {
    const progress = calculateGoalProgress({ ...TRIP, targetDate: '2026-09-30' }, '2026-10-05');

    expect(progress).toMatchObject({
      state: 'OVERDUE',
      daysRemaining: -5,
      requiredMonthlyMinor: null,
    });
  });

  it('stays completed after its target date', () => {
    const progress = calculateGoalProgress(
      { ...TRIP, currentAmountMinor: 100000, targetDate: '2026-09-30' },
      '2026-10-05',
    );

    expect(progress.state).toBe('COMPLETED');
  });

  it('is still in progress on its target date', () => {
    const progress = calculateGoalProgress({ ...TRIP, targetDate: '2026-10-05' }, '2026-10-05');

    expect(progress).toMatchObject({
      state: 'IN_PROGRESS',
      daysRemaining: 0,
      requiredMonthlyMinor: 38000,
    });
  });

  it('works out the monthly saving needed to reach the target in time', () => {
    const progress = calculateGoalProgress({ ...TRIP, targetDate: '2027-10-05' }, '2026-10-05');

    expect(progress).toMatchObject({ daysRemaining: 365, requiredMonthlyMinor: 3167 });
  });

  it('never asks for more per month than what remains', () => {
    const progress = calculateGoalProgress({ ...TRIP, targetDate: '2026-10-15' }, '2026-10-05');

    expect(progress.requiredMonthlyMinor).toBe(38000);
  });

  it.each([0, -100, 10.5, Number.NaN])('rejects a target of %d', (targetAmountMinor) => {
    expect(() => calculateGoalProgress({ ...TRIP, targetAmountMinor }, '2026-10-05')).toThrow(
      InvalidGoalError,
    );
  });

  it.each([-1, 0.5])('rejects a saved amount of %d', (currentAmountMinor) => {
    expect(() => calculateGoalProgress({ ...TRIP, currentAmountMinor }, '2026-10-05')).toThrow(
      InvalidGoalError,
    );
  });
});
