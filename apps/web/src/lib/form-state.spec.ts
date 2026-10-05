import { INITIAL_FORM_STATE, failedState, formValues, returnPath } from './form-state';

describe('returnPath', () => {
  it.each([
    ['/transactions?month=2026-10&page=2', '/transactions?month=2026-10&page=2'],
    ['/budgets', '/budgets'],
  ])('keeps the page %s inside the dashboard', (value, expected) => {
    expect(returnPath(value, '/fallback')).toBe(expected);
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', ''])(
    'refuses to leave the site through %j',
    (value) => {
      expect(returnPath(value, '/fallback')).toBe('/fallback');
    },
  );

  it('falls back when nothing was sent', () => {
    expect(returnPath(null, '/goals')).toBe('/goals');
  });
});

describe('formValues', () => {
  it('reads the named fields as text, empty when absent', () => {
    const form = new FormData();
    form.set('amount', '12,50');

    expect(formValues(form, ['amount', 'merchant'])).toEqual({ amount: '12,50', merchant: '' });
  });
});

describe('failedState', () => {
  const values = { amount: 'abc' };

  it('maps each refused field to its code and keeps what was typed', () => {
    const state = failedState(
      { status: 422, body: { errors: [{ field: 'amount', code: 'INVALID_AMOUNT' }] } },
      values,
      INITIAL_FORM_STATE,
    );

    expect(state).toEqual({
      problem: 'INVALID',
      errors: { amount: 'INVALID_AMOUNT' },
      values,
      attempt: 1,
    });
  });

  it.each([
    [409, 'STALE'],
    [404, 'MISSING'],
    [429, 'TOO_MANY'],
    [500, 'UNAVAILABLE'],
    [400, 'UNAVAILABLE'],
  ] as const)('describes status %d as %s', (status, problem) => {
    expect(failedState({ status, body: undefined }, values, INITIAL_FORM_STATE)).toMatchObject({
      problem,
      errors: {},
      values,
    });
  });

  it('counts attempts so the form shows the values that were sent', () => {
    const first = failedState({ status: 409, body: undefined }, values, INITIAL_FORM_STATE);

    expect(failedState({ status: 409, body: undefined }, values, first).attempt).toBe(2);
  });
});
