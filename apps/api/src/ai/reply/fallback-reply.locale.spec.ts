import { AI_UNAVAILABLE_REPLY, aiUnavailableReply, renderFallbackReply } from './fallback-reply.js';

describe('fallback replies by language', () => {
  it('opens with a Portuguese headline for a Portuguese household', () => {
    expect(renderFallbackReply('QUESTION_ANSWERED', { total: '€ 12,00' }, 'pt-BR')).toBe(
      'Aqui está o que encontrei.\ntotal: € 12,00',
    );
    expect(renderFallbackReply('WELCOME', {}, 'pt-BR')).toContain('Seja bem-vindo.');
  });

  it('keeps English as the default', () => {
    expect(renderFallbackReply('QUESTION_ANSWERED', {})).toBe('Here is what I found.');
    expect(aiUnavailableReply()).toBe(AI_UNAVAILABLE_REPLY);
  });

  it('says the assistant is unavailable in Portuguese', () => {
    expect(aiUnavailableReply('pt-BR')).toBe(
      'Não consegui processar isso agora. Nada foi registrado. Tente novamente em instantes.',
    );
  });
});
