export function lowerMedian(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length / 2) - 1];
}
