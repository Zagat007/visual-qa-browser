export function median(values: number[]): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  if (finite.length % 2 === 1) return finite[middle] ?? null;
  const left = finite[middle - 1];
  const right = finite[middle];
  if (left === undefined || right === undefined) return null;
  return (left + right) / 2;
}

export function medianNullable(values: Array<number | null>): number | null {
  return median(values.filter((value): value is number => value !== null));
}
