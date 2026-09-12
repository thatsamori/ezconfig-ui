import { validateEntries } from '@/lib/database/validation';
import type { ConfigData } from '@/lib/database/types';
import { constrainedFloatTextError } from './numericConstraints';

/** Check this new category before preset replacement can clear existing data. */
export function assertCameraPolicy(entries: unknown): void {
  if (entries === undefined) return;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Camera policy must be an object.');
  const result = validateEntries(entries as ConfigData, 'Character', 'Camera');
  if (!result.valid) throw new Error(result.errors.map(error => `Camera/${error.key}: ${error.reason}`).join('; '));
}

/** Selected apply carries wire strings: validate the original decimal text,
 * before any Number/Float coercion or the optional preceding wipe.
 * Unrelated commands retain their existing parser/acknowledgment semantics.
 */
export function cameraCommandError(commands: readonly string[]): string | undefined {
  for (const command of commands) {
    const match = /^(?:string\s+)?ezconfig\s+Character\s+\S+\s+(\{[\s\S]*\})\s*$/i.exec(command);
    if (!match) continue;
    let entries: Record<string, unknown>;
    try { entries = JSON.parse(match[1]); } catch { continue; }
    for (const [key, value] of Object.entries(entries)) {
      if (key.toLowerCase() === 'customfov' && (typeof value !== 'string' || !/^(true|false)$/i.test(value))) {
        return 'CustomFOV: Use a serialized True or False value.';
      }
      if (key.toLowerCase() === 'customfovmax') {
        const error = typeof value === 'string'
          ? value !== value.trim() ? 'Numeric wire values cannot contain surrounding whitespace.' : constrainedFloatTextError(value, 101, 179, true)
          : 'Recognized config values must be serialized strings.';
        if (error) return `CustomFOVMax: ${error}`;
      }
    }
  }
}
