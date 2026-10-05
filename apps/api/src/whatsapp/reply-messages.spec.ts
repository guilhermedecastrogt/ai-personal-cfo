import { pauseBeforeInMilliseconds, splitIntoMessages } from './reply-messages.js';

describe('splitIntoMessages', () => {
  it('sends a single paragraph as one message', () => {
    expect(splitIntoMessages('Registrei €12.00 no Tesco.')).toEqual(['Registrei €12.00 no Tesco.']);
  });

  it('sends each paragraph as its own message, trimmed', () => {
    expect(
      splitIntoMessages('Olá, Beatriz.\n\n  Sou o seu CFO.  \n \t\nExperimente algo.'),
    ).toEqual(['Olá, Beatriz.', 'Sou o seu CFO.', 'Experimente algo.']);
  });

  it('keeps line breaks inside a paragraph together', () => {
    expect(
      splitIntoMessages('Aqui está o que encontrei.\namount: €12.00\ncategory: Groceries'),
    ).toHaveLength(1);
  });

  it('ignores empty paragraphs and a reply that is only whitespace', () => {
    expect(splitIntoMessages('\n\n\nUm.\n\n\n\nDois.\n\n')).toEqual(['Um.', 'Dois.']);
    expect(splitIntoMessages('  \n\n  ')).toEqual([]);
  });

  it('never sends more than five messages, keeping everything in the last one', () => {
    const reply = ['1', '2', '3', '4', '5', '6', '7'].join('\n\n');

    const messages = splitIntoMessages(reply);

    expect(messages).toHaveLength(5);
    expect(messages.slice(0, 4)).toEqual(['1', '2', '3', '4']);
    expect(messages[4]).toBe('5\n\n6\n\n7');
  });
});

describe('pauseBeforeInMilliseconds', () => {
  it('waits a little longer for a longer message, within bounds', () => {
    expect(pauseBeforeInMilliseconds('Ok.')).toBeGreaterThanOrEqual(700);
    expect(pauseBeforeInMilliseconds('x'.repeat(60))).toBeGreaterThan(
      pauseBeforeInMilliseconds('x'),
    );
    expect(pauseBeforeInMilliseconds('x'.repeat(5000))).toBe(2500);
  });
});
