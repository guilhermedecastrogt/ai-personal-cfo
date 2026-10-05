import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_ROOT = __dirname;

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
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.includes('.spec.') &&
      !path.includes('/testing/');
    return isProductionSource
      ? [{ path: relative(SOURCE_ROOT, path), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

function offenders(files: readonly SourceFile[], pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(file.text)).map((file) => file.path);
}

describe('web architecture', () => {
  const files = sourceFiles(SOURCE_ROOT);

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('takes only types from the backend, through one file', () => {
    const importsBackend = files.filter((file) => file.text.includes("from '@api/"));

    expect(importsBackend.map((file) => file.path)).toEqual(['lib/contracts.ts']);
    expect(importsBackend[0]?.text).not.toMatch(/^import (?!type)/m);
    expect(importsBackend[0]?.text).toMatch(/^export type \{/);
  });

  it('does not reach the database, the ORM, repositories or backend services', () => {
    const forbidden =
      /drizzle|from 'pg'|postgres|\.repository|FinanceService|CfoService|finance\/domain|node:fs|openai/i;

    expect(offenders(files, forbidden)).toEqual([]);
  });

  it('contains no financial calculation', () => {
    const calculation =
      /\bcalculate[A-Z]\w*|\bsumMinor\b|\.reduce\(|\.minor\s*[-+*/]|[-+*/]\s*\w+(\.\w+)*\.minor\b|parseFloat|toFixed|Number\(\w+\.text/;

    expect(offenders(files, calculation)).toEqual([]);
  });

  it('computes no recurring commitment, cadence or status in the browser', () => {
    const view = files.find((file) => file.path === 'components/views/recurring-view.tsx');

    expect(view?.text).toContain('entry.monthlyEquivalent');
    expect(view?.text).toContain('entry.annualEquivalent');
    expect(
      offenders(files, /occurrencesPerYear|\* ?(12|52|4)\b|\/ ?12\b|daysBetween|graceIn/),
    ).toEqual([]);
  });

  it('formats no money and no percentage itself', () => {
    expect(offenders(files, /Intl\.NumberFormat|toLocaleString|style:\s*'currency'/)).toEqual([]);
  });

  it('decides no budget, goal or severity status itself', () => {
    const thresholds = /alertThresholdPercent\s*[<>]|basisPoints\s*[<>]=?\s*\d|usage\.\w+\s*[<>]/;

    expect(offenders(files, thresholds)).toEqual([]);
  });

  it('calls the backend only from the server-side client and the sign-in actions', () => {
    expect(offenders(files, /\bfetch\(/).sort()).toEqual(['app/login/actions.ts', 'lib/api.ts']);
  });

  it('keeps the session in an http-only cookie and out of browser storage', () => {
    const actions = files.find((file) => file.path === 'app/login/actions.ts');

    expect(actions?.text).toContain('httpOnly: true');
    expect(offenders(files, /localStorage|sessionStorage|document\.cookie/)).toEqual([]);
  });

  it('never names a household or member identifier', () => {
    expect(offenders(files, /householdId|household_id|memberId|member_id/)).toEqual([]);
  });
});
