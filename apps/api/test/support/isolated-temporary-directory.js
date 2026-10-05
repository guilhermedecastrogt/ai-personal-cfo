import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TMPDIR = mkdtempSync(join(tmpdir(), 'cfo-test-worker-'));
