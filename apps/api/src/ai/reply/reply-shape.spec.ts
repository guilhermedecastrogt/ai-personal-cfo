import { withoutTrailingQuestion } from './reply-shape.js';

describe('withoutTrailingQuestion', () => {
  it('drops a closing message that only offers more help', () => {
    expect(
      withoutTrailingQuestion(
        'Vocês gastaram € 120,00 este mês.\n\nQuer que eu detalhe por categoria?',
      ),
    ).toBe('Vocês gastaram € 120,00 este mês.');
  });

  it('drops a closing question inside the only message', () => {
    expect(
      withoutTrailingQuestion('Vocês gastaram € 120,00 este mês. Deseja que eu altere algo?'),
    ).toBe('Vocês gastaram € 120,00 este mês.');
  });

  it('keeps a reply that does not end with a question', () => {
    const reply = 'Posso ajudar com gastos?\n\nÉ só me contar.';

    expect(withoutTrailingQuestion(reply)).toBe(reply);
  });

  it('keeps a reply that is only a question', () => {
    expect(withoutTrailingQuestion('Em qual conta?')).toBe('Em qual conta?');
  });
});
