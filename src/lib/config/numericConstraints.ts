/** Opt-in scalar policy; legacy controls keep their existing validation. */
export function constrainedFloatError(value: unknown, minimum: number, maximum?: number, integer = false): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || (maximum !== undefined && value > maximum)) {
    return maximum === undefined ? `Use a finite value of ${minimum} or more.` : `Use a finite value from ${minimum} to ${maximum}.`;
  }
  if (integer && !Number.isInteger(value)) return 'Use a whole number.';
  const gameValue = Math.fround(value);
  if (!Number.isFinite(gameValue) || (value !== 0 && gameValue === 0)) {
    return 'Value is outside the supported numeric range.';
  }
  return undefined;
}

/** Check decimal text before Number/Float rounding can erase a fraction.
 * Integral decimal and scientific spellings are equivalent, e.g. 120.0/1.2e2.
 */
export function constrainedFloatTextError(text: string, minimum: number, maximum?: number, integer = false): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return 'Enter a value.';
  if (integer) {
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(trimmed);
    if (!match) return 'Use a whole number.';
    const fraction = match[3] ?? match[4] ?? '';
    const digits = ((match[2] ?? '') + fraction).replace(/^0+/, '');
    const shift = Number(match[5] ?? 0) - fraction.length;
    const trailingZeros = digits.length - digits.replace(/0+$/, '').length;
    if (digits && shift < -trailingZeros) return 'Use a whole number.';
  }
  return constrainedFloatError(Number(trimmed), minimum, maximum, integer);
}
