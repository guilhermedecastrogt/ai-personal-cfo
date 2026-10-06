import { readConfirmation } from './confirmation.js';

describe('readConfirmation', () => {
  it.each(['sim', 'Sim!', 'isso mesmo', 'pode', 'pode apagar', 'ok', 'Confirmo', 'yes please'])(
    'reads %j as yes',
    (text) => {
      expect(readConfirmation(text)).toBe('YES');
    },
  );

  it.each(['não', 'Nao.', 'não precisa', 'deixa assim', 'cancela', 'no thanks'])(
    'reads %j as no',
    (text) => {
      expect(readConfirmation(text)).toBe('NO');
    },
  );

  it.each([
    'não, foi 45',
    'sim, foi a Bia',
    '10.65 dia 3 bia comprou lanche',
    'isso foi dia 1',
    'pode ser no inter',
    'quanto gastamos?',
    '',
  ])('leaves %j to the interpreter', (text) => {
    expect(readConfirmation(text)).toBeUndefined();
  });
});
