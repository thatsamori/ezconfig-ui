/** Opt-in scalar policy; legacy controls keep their existing validation. */
export function constrainedFloatError(value: unknown, minimum: number): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    return `Use a finite value of ${minimum} or more.`;
  }
  const gameValue = Math.fround(value);
  if (!Number.isFinite(gameValue) || (value !== 0 && gameValue === 0)) {
    return 'Value is outside the supported numeric range.';
  }
  return undefined;
}
