import { validateEntries } from '@/lib/database/validation';
import type { ConfigData } from '@/lib/database/types';

/** Check this new category before preset replacement can clear existing data. */
export function assertCameraPolicy(entries: unknown): void {
  if (entries === undefined) return;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Camera policy must be an object.');
  const result = validateEntries(entries as ConfigData, 'Character', 'Camera');
  if (!result.valid) throw new Error(result.errors.map(error => `Camera/${error.key}: ${error.reason}`).join('; '));
}

