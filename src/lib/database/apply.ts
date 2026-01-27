/**
 * Apply service - Send config to game via RCON
 *
 * Builds RCON commands from all non-empty category files and executes them
 * in sequence: WipeDatabases first, then each category's config.
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { getDatabasesRoot, readCategory } from './service';
import { getSchemaForCategory } from './validation';
import { formatValue } from '@/lib/rcon/formatters';
import { executeBatchCommands } from '@/lib/rcon/service';
import type { ConfigData, ConfigValue } from './types';

/**
 * Result of an apply operation
 */
export interface ApplyResult {
  success: boolean;
  commandsSent: number;
  error?: string;
  failedAt?: string;
}

/**
 * Convert a config value to RCON format using the schema
 */
function convertValueToRcon(
  key: string,
  value: ConfigValue,
  database: string,
  category: string
): string | null {
  const schema = getSchemaForCategory(database, category);
  if (!schema) {
    return null;
  }

  const schemaEntry = schema[key];
  if (!schemaEntry) {
    return null;
  }

  return formatValue(schemaEntry.dataType, value);
}

/**
 * Build RCON commands for all non-empty category files
 *
 * Command format: string ezconfig {database} {category} {JSON object of converted entries}
 * Example: string ezconfig Character Movement {"CanDodge":"True","TimeToMaxSprint":"0.94"}
 *
 * For flat databases (Character): database = "Character"
 * For grouped databases (Weapon/Greatsword): database = "Greatsword"
 */
export async function buildRconCommands(): Promise<string[]> {
  const root = getDatabasesRoot();
  const commands: string[] = [];

  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return commands;
    }
  } catch {
    return commands;
  }

  const rootEntries = await readdir(root, { withFileTypes: true });
  const dirs = rootEntries.filter((entry) => entry.isDirectory());

  for (const dir of dirs) {
    const dirPath = join(root, dir.name);
    const dirEntries = await readdir(dirPath, { withFileTypes: true });

    // Check if this is a flat database (has JSON files) or grouped (has subdirs only)
    const hasJsonFiles = dirEntries.some((e) => e.isFile() && e.name.endsWith('.json'));
    const hasSubdirs = dirEntries.some((e) => e.isDirectory());

    if (hasJsonFiles) {
      // Flat database (like Character/)
      for (const entry of dirEntries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const category = entry.name.replace('.json', '');
          const cmd = await buildCommandForCategory(dir.name, dir.name, category);
          if (cmd) {
            commands.push(cmd);
          }
        }
      }
    } else if (hasSubdirs) {
      // Grouped database (like Weapon/)
      for (const subdir of dirEntries.filter((e) => e.isDirectory())) {
        const subdirPath = join(dirPath, subdir.name);
        const categoryEntries = await readdir(subdirPath, { withFileTypes: true });

        for (const catEntry of categoryEntries) {
          if (catEntry.isFile() && catEntry.name.endsWith('.json')) {
            const category = catEntry.name.replace('.json', '');
            // For grouped databases, the RCON database name is the subdirectory name (e.g., "Greatsword")
            const cmd = await buildCommandForCategory(subdir.name, subdir.name, category);
            if (cmd) {
              commands.push(cmd);
            }
          }
        }
      }
    }
  }

  return commands;
}

/**
 * Build a single RCON command for a category
 * Returns null if the category is empty or has no valid entries
 */
async function buildCommandForCategory(
  rconDatabase: string,
  schemaDatabase: string,
  category: string
): Promise<string | null> {
  const data = await readCategory(schemaDatabase, category);

  if (Object.keys(data).length === 0) {
    return null;
  }

  // Convert each key-value pair to RCON format
  const convertedEntries: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    const rconValue = convertValueToRcon(key, value, schemaDatabase, category);
    if (rconValue !== null) {
      convertedEntries[key] = rconValue;
    }
  }

  if (Object.keys(convertedEntries).length === 0) {
    return null;
  }

  // Build command: string ezconfig {database} {category} {entries}
  const entriesJson = JSON.stringify(convertedEntries);
  return `string ezconfig ${rconDatabase} ${category} ${entriesJson}`;
}

/**
 * Apply all config to the game via RCON
 *
 * Sequence:
 * 1. Send WipeDatabases command
 * 2. Send each non-empty category's config
 */
export async function applyConfig(): Promise<ApplyResult> {
  try {
    const categoryCommands = await buildRconCommands();

    // Build full command list: WipeDatabases first, then all category commands
    const commands = ['string ezconfig WipeDatabases', ...categoryCommands];

    console.log(`Applying config: ${commands.length} commands to send`);
    for (const cmd of commands) {
      console.log(`  - ${cmd.substring(0, 100)}${cmd.length > 100 ? '...' : ''}`);
    }

    await executeBatchCommands(commands);

    return {
      success: true,
      commandsSent: commands.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error applying config:', errorMessage);

    return {
      success: false,
      commandsSent: 0,
      error: errorMessage,
      failedAt: 'RCON connection',
    };
  }
}
