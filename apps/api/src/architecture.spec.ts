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
        importsOf(file).some((name) => /(^|\/)(ai|media|conversation|whatsapp)\//.test(name)),
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

  it('reaches the network only through the OpenAI provider and the Kapso adapter', () => {
    const networkAccess =
      /\bfetch\(|^import (?!type)[^;]*'node:(https?|net|tls|dgram)'|\bXMLHttpRequest\b/m;
    const elsewhere = files.filter(
      (file) => !file.path.startsWith('ai/openai/') && !file.path.startsWith('whatsapp/kapso/'),
    );

    expect(offenders(elsewhere, (file) => networkAccess.test(file.text))).toEqual([]);
  });

  it('keeps Kapso-specific code inside the Kapso adapter', () => {
    const outsideAdapter = files.filter(
      (file) => !file.path.startsWith('whatsapp/kapso/') && file.path !== 'app.module.ts',
    );

    expect(
      offenders(outsideAdapter, (file) => importsOf(file).some((name) => /kapso/i.test(name))),
    ).toEqual([]);
    expect(
      offenders(
        files.filter(
          (file) =>
            !file.path.startsWith('whatsapp/kapso/') &&
            !file.path.startsWith('config/') &&
            !file.path.startsWith('database/seed/') &&
            file.path !== 'app.module.ts',
        ),
        (file) => /kapso/i.test(file.text),
      ),
    ).toEqual([]);
  });

  it('keeps the application independent of the messaging provider and the messaging layer', () => {
    const application = within(
      'ai/',
      'conversation/',
      'media/',
      'finance/',
      'money/',
      'transactions/',
    );

    expect(
      offenders(application, (file) =>
        importsOf(file).some((name) => /(^|\/)whatsapp\//.test(name)),
      ),
    ).toEqual([]);
  });

  it('keeps financial calculation out of the messaging layer', () => {
    const messaging = within('whatsapp/');
    const financialLogic = /finance\/domain|money-math|Minor\b|BasisPoints|formatMoney|parseMoney/;

    expect(offenders(messaging, (file) => financialLogic.test(file.text))).toEqual([]);
  });

  it('claims webhook events through the unique key and nowhere else', () => {
    const writers = files.filter((file) => file.text.includes('insert(webhookEvents)'));

    expect(writers.map((file) => file.path)).toEqual(['whatsapp/webhook-events.repository.ts']);
    expect(writers[0]?.text).toContain('onConflictDoNothing');
  });

  it('defines no column that could hold image bytes', () => {
    const schemas = files.filter((file) => file.path.endsWith('.schema.ts'));

    expect(schemas.length).toBeGreaterThan(8);
    expect(offenders(schemas, (file) => /bytea|customType|blob/i.test(file.text))).toEqual([]);
  });

  it('writes files only from the Kapso media source, into the path it is given', () => {
    const writesFiles = /\b(writeFile|createWriteStream|appendFile|copyFile)\b/;

    expect(offenders(files, (file) => writesFiles.test(file.text))).toEqual([
      'whatsapp/kapso/kapso-media-source.ts',
    ]);
  });
});
