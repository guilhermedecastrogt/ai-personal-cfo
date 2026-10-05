import { InvalidMonthError, listMonths, selectMonth } from './month-selection.js';

describe('month selection', () => {
  it('names months in English by default', () => {
    expect(selectMonth('2026-09', '2026-10-20')).toMatchObject({
      key: '2026-09',
      label: 'September 2026',
      isComplete: true,
      asOf: '2026-09-30',
    });
  });

  it('names months in Brazilian Portuguese, with a capital first letter', () => {
    expect(selectMonth(undefined, '2026-10-20', 'pt-BR')).toMatchObject({
      key: '2026-10',
      label: 'Outubro de 2026',
      isComplete: false,
      asOf: '2026-10-20',
    });
    expect(listMonths('2026-08-14', '2026-10-20', 'pt-BR').map((month) => month.label)).toEqual([
      'Outubro de 2026',
      'Setembro de 2026',
      'Agosto de 2026',
    ]);
  });

  it('refuses a month that has not started', () => {
    expect(() => selectMonth('2026-11', '2026-10-20', 'pt-BR')).toThrow(InvalidMonthError);
  });
});
