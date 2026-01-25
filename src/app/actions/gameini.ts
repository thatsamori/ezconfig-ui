'use server';

/**
 * @deprecated This action is from v0.1 and will be removed.
 * The v1.0 architecture uses JSON database files instead of Game.ini.
 * Use /api/config/{database}/{category} endpoints instead.
 */

import { ParsedGameIni } from '@/lib/gameini';

export type LoadGameIniResult =
  | {
      success: true;
      data: ParsedGameIni;
    }
  | {
      success: false;
      error: string;
    };

/**
 * @deprecated This function is from v0.1 and will be removed.
 * Returns empty data structure for backwards compatibility during migration.
 */
export async function loadGameIniConfig(): Promise<LoadGameIniResult> {
  // Return empty data structure for v0.1 UI compatibility
  // This will be removed when the v1.0 UI refactor is complete
  return {
    success: true,
    data: {
      characterValues: {},
      weaponValues: {},
    },
  };
}
