import { canonicalFigure, findUnverifiedFigures } from './reply-guard.js';

const FACTS = {
  total: '€1,234.50',
  budget: '€300.00',
  usage: '82%',
  change: '33.33%',
  period: { start: '2026-10-01', end: '2026-10-31' },
};

function unverified(reply: string, userMessage = ''): string[] {
  return findUnverifiedFigures(reply, FACTS, userMessage);
}

describe('canonicalFigure', () => {
  it.each([
    ['625.00', '625'],
    ['625', '625'],
    ['1,234.50', '1234.5'],
    ['1.234,50', '1234.5'],
    ['1,234', '1234'],
    ['33.33', '33.33'],
    ['05', '5'],
    ['0.05', '0.05'],
  ])('reads %s as %s', (token, expected) => {
    expect(canonicalFigure(token)).toBe(expected);
  });
});

describe('findUnverifiedFigures', () => {
  it('accepts a reply that uses the figures of the facts', () => {
    expect(unverified('You spent €1,234.50, which is 82% of your €300.00 budget.')).toEqual([]);
  });

  it('accepts the same figure written in another locale or without trailing zeros', () => {
    expect(unverified('Vocês gastaram 1.234,50 € de um orçamento de 300 €.')).toEqual([]);
  });

  it('accepts dates taken from the facts', () => {
    expect(unverified('Between 01/10/2026 and 31/10/2026 you spent €1,234.50.')).toEqual([]);
  });

  it('accepts a figure the member wrote in their own message', () => {
    expect(unverified('You asked about 200.', 'Can I spend 200 this weekend?')).toEqual([]);
  });

  it('reports an amount that is not in the facts', () => {
    expect(unverified('You spent €1,300.00 this month.')).toEqual(['1300']);
  });

  it('reports a percentage that is not in the facts', () => {
    expect(unverified('That is 85% of your budget.')).toEqual(['85']);
  });

  it('reports a figure the model derived by calculation', () => {
    expect(unverified('You have €934.50 left after the budget.')).toEqual(['934.5']);
  });

  it('accepts a reply without figures', () => {
    expect(unverified('Which category should I use?')).toEqual([]);
  });
});
