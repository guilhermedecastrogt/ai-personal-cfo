import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

function sourceFiles(directory: string): SourceFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    const isProductionSource =
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.fixture.ts');
    return isProductionSource
      ? [{ path: relative(SOURCE_ROOT, path), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

function importsOf(file: SourceFile): string[] {
  return [...file.text.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '');
}

function offenders(
  files: readonly SourceFile[],
  isOffence: (file: SourceFile) => boolean,
): string[] {
  return files.filter(isOffence).map((file) => file.path);
}

describe('architecture', () => {
  const files = sourceFiles(SOURCE_ROOT);
  const within = (...folders: string[]): SourceFile[] =>
    files.filter((file) => folders.some((folder) => file.path.startsWith(folder)));

  it('imports the OpenAI SDK only inside the OpenAI provider', () => {
    const outsideProvider = files.filter((file) => !file.path.startsWith('ai/openai/'));

    expect(
      offenders(outsideProvider, (file) =>
        importsOf(file).some((name) => /^openai(\/|$)/.test(name)),
      ),
    ).toEqual([]);
  });

  it('keeps the finance engine and money handling independent of AI, media and persistence', () => {
    const forbidden =
      /(^|\/)(ai|media|conversation|database)\/|^openai|^drizzle-orm|^pg$|^@nestjs\//;

    expect(
      offenders(within('finance/domain/', 'money/'), (file) =>
        importsOf(file).some((name) => forbidden.test(name)),
      ),
    ).toEqual([]);
  });

  it('keeps the financial domain modules independent of AI and media', () => {
    const domain = within(
      'accounts/',
      'budgets/',
      'categories/',
      'goals/',
      'households/',
      'transactions/',
      'finance/',
    );

    expect(
      offenders(domain, (file) =>
        importsOf(file).some((name) => /(^|\/)(ai|media|conversation)\//.test(name)),
      ),
    ).toEqual([]);
  });

  it('gives the AI and media layers no access to the database', () => {
    expect(
      offenders(within('ai/', 'media/'), (file) =>
        importsOf(file).some((name) => /drizzle-orm|^pg$|\/database\//.test(name)),
      ),
    ).toEqual([]);
  });

  it('fetches nothing over the network from the media and image extraction layers', () => {
    const networkAccess = /\bfetch\(|node:https?|node:net|https?:\/\//;

    expect(
      offenders(within('media/', 'conversation/image/', 'ai/vision/'), (file) =>
        networkAccess.test(file.text),
      ),
    ).toEqual([]);
  });

  it('defines no column that could hold image bytes', () => {
    const schemas = files.filter((file) => file.path.endsWith('.schema.ts'));

    expect(schemas.length).toBeGreaterThan(8);
    expect(offenders(schemas, (file) => /bytea|customType|blob/i.test(file.text))).toEqual([]);
  });

  it('writes no file to disk anywhere in production code', () => {
    const writesFiles = /\b(writeFile|createWriteStream|appendFile|copyFile)\b/;

    expect(offenders(files, (file) => writesFiles.test(file.text))).toEqual([]);
  });
});
