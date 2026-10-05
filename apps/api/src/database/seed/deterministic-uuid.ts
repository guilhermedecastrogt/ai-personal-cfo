import { createHash } from 'node:crypto';

const PART_SEPARATOR = '\u001f';
const NAME_BASED_VERSION = '5';
const RFC_4122_VARIANT = '8';

export function deterministicUuid(...parts: readonly string[]): string {
  const digest = createHash('sha256').update(parts.join(PART_SEPARATOR)).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `${NAME_BASED_VERSION}${digest.slice(13, 16)}`,
    `${RFC_4122_VARIANT}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}
