import { buildReplyInstructions } from './reply/reply-instructions.js';
import { buildReviewExplanationInstructions } from './review/review-explanation-instructions.js';
import { normalizeAssistantVoice } from './voice.js';

describe('assistant voice', () => {
  it.each([
    ['reply', buildReplyInstructions('QUESTION_ANSWERED')],
    ['monthly review', buildReviewExplanationInstructions()],
  ])('applies the premium voice to every %s prompt', (_kind, instructions) => {
    expect(instructions).toContain('formal but natural');
    expect(instructions).toContain('discreet, intelligent humour');
    expect(instructions).toContain('Do not use dashes as punctuation');
    expect(instructions).toContain('Avoid excessive punctuation');
    expect(instructions).toContain('Do not praise routine actions');
  });

  it('keeps proactive notifications sober', () => {
    expect(buildReplyInstructions('PROACTIVE_NOTIFICATION')).toContain('Do not use humour');
  });

  it('uses prose instead of a bullet list for the welcome', () => {
    const instructions = buildReplyInstructions('WELCOME');

    expect(instructions).toContain('without a list');
    expect(instructions).toContain('without a marker');
  });

  it('removes long dashes from generated text', () => {
    expect(normalizeAssistantVoice('Certo — a despesa foi registada.')).toBe(
      'Certo, a despesa foi registada.',
    );
    expect(normalizeAssistantVoice('O saldo–por enquanto–está estável.')).toBe(
      'O saldo, por enquanto, está estável.',
    );
  });
});
