const MAXIMUM_MESSAGES = 5;
const BLANK_LINE = /\n[ \t]*\n/;
const MINIMUM_PAUSE_IN_MILLISECONDS = 700;
const PAUSE_PER_CHARACTER_IN_MILLISECONDS = 18;
const MAXIMUM_PAUSE_IN_MILLISECONDS = 2500;

export function splitIntoMessages(reply: string): string[] {
  const parts = reply
    .split(BLANK_LINE)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length <= MAXIMUM_MESSAGES) {
    return parts;
  }
  return [...parts.slice(0, MAXIMUM_MESSAGES - 1), parts.slice(MAXIMUM_MESSAGES - 1).join('\n\n')];
}

export function pauseBeforeInMilliseconds(message: string): number {
  return Math.min(
    MAXIMUM_PAUSE_IN_MILLISECONDS,
    MINIMUM_PAUSE_IN_MILLISECONDS + message.length * PAUSE_PER_CHARACTER_IN_MILLISECONDS,
  );
}
