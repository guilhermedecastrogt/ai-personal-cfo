import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WAIT_IN_MILLISECONDS = 2000;
const POLL_IN_MILLISECONDS = 50;

async function entries(): Promise<string[]> {
  return readdir(join(tmpdir(), 'ai-personal-cfo-media')).catch(() => []);
}

export async function remainingTemporaryMedia(): Promise<string[]> {
  const deadline = Date.now() + WAIT_IN_MILLISECONDS;
  let remaining = await entries();
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_IN_MILLISECONDS));
    remaining = await entries();
  }
  return remaining;
}
