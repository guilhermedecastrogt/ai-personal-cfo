const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  const failure = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return failure?.code === UNIQUE_VIOLATION || failure?.cause?.code === UNIQUE_VIOLATION;
}
