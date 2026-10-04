/** Display a percentage only when both values and a nonzero baseline exist. */
export function comparableDelta(current: number | undefined | null, previous: number | undefined | null): number | null {
  if (current == null || previous == null || previous === 0 || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return ((current - previous) / previous) * 100;
}
