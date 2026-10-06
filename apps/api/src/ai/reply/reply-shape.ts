const PARAGRAPH_BREAK = /\n[ \t]*\n/;
const SENTENCE = /[^.!?]+[.!?]*\s*/g;

export function withoutTrailingQuestion(reply: string): string {
  const paragraphs = reply.split(PARAGRAPH_BREAK).map((paragraph) => paragraph.trim());
  const last = paragraphs.at(-1) ?? '';
  if (!last.endsWith('?')) {
    return reply;
  }
  if (paragraphs.length > 1) {
    return paragraphs.slice(0, -1).join('\n\n');
  }
  const sentences = last.match(SENTENCE)?.map((sentence) => sentence.trim()) ?? [];
  if (sentences.length < 2) {
    return reply;
  }
  return sentences.slice(0, -1).join(' ');
}
