'use server';

import { env, validateEnv } from '@/lib/env';
import { parseGameIni, ParsedGameIni } from '@/lib/gameini';

export type LoadGameIniResult = {
  success: true;
  data: ParsedGameIni;
} | {
  success: false;
  error: string;
};

export async function loadGameIniConfig(): Promise<LoadGameIniResult> {
  try {
    validateEnv();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Environment validation failed',
    };
  }

  try {
    const data = await parseGameIni(env.gameIniPath);
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse Game.ini',
    };
  }
}
