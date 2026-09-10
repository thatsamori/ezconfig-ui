/**
 * Apply service - Send config to game via RCON
 *
 * Builds RCON commands from all non-empty category files and executes them
 * in sequence: WipeDatabases first, then each category's config.
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { getDatabasesRoot, readCategory } from './service';
import { getSchemaForCategory, validateEntries } from './validation';
import { formatValue } from '@/lib/rcon/formatters';
import { executeAcknowledgedBatch } from '@/lib/rcon/service';
import type { BatchApplyResult } from '@/lib/rcon/batch';
import type { ConfigData, ConfigValue } from './types';
import { constrainedFloatError } from '@/lib/config/numericConstraints';

/**
 * Result of an apply operation
 */
export type ApplyResult = BatchApplyResult;

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

  // A positive constrained duration must not round down to the zero-duration
  // policy. Preserve its accepted value; existing wire formats stay intact.
  if (schemaEntry.dataType === 'Float' && schemaEntry.minimum !== undefined) {
    const error = constrainedFloatError(value, schemaEntry.minimum);
    if (error) throw new Error(`${key}: ${error}`);
    return String(value);
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
export async function buildRconCommands(options: { databasesRoot?: string; strictStorage?: boolean } = {}): Promise<string[]> {
  const root = options.databasesRoot ?? getDatabasesRoot();
  const commands: string[] = [];

  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      if (options.strictStorage) throw new Error('Automatic-sync database storage is not a directory');
      return commands;
    }
  } catch (error) {
    if (options.strictStorage) throw error;
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
          const cmd = await buildCommandForCategory(dir.name, dir.name, category, options.strictStorage ? join(dirPath, entry.name) : undefined);
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
            const cmd = await buildCommandForCategory(subdir.name, subdir.name, category, options.strictStorage ? join(subdirPath, catEntry.name) : undefined);
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
  category: string,
  strictFilePath?: string,
): Promise<string | null> {
  const data: ConfigData = strictFilePath
    ? JSON.parse(await readFile(strictFilePath, 'utf8'))
    : await readCategory(schemaDatabase, category);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid saved configuration: expected an object');
  if (strictFilePath) {
    const validation = validateEntries(data, schemaDatabase, category);
    if (!validation.valid) throw new Error(`Invalid saved configuration in ${schemaDatabase}/${category}: ${validation.errors.map(({ key, reason }) => `${key}: ${reason}`).join('; ')}`);
    const finite = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value)
      : value !== null && typeof value === 'object' ? Object.values(value).every(finite) : true;
    if (!finite(data)) throw new Error(`Nonfinite saved configuration in ${schemaDatabase}/${category}`);
  }

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

    return await executeAcknowledgedBatch(commands);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error applying config:', errorMessage);

    return {
      success: false,
      status: 'rejected',
      commandsSent: 0,
      commandsSucceeded: 0,
      acceptedValues: 0,
      ignoredKeys: 0,
      configurationCleared: false,
      error: errorMessage,
      failedAt: 'preparing configuration',
    };
  }
}
