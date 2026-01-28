/**
 * Database structure scanning service
 *
 * Scans the Databases directory to build a structure map showing
 * all databases, subdatabases (for grouped types like Weapon), and categories.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { getDatabasesRoot } from './service';
import type { PresetData, ConfigValue } from '@/lib/presets/types';

/**
 * Database structure types
 *
 * Flat database: { "Character": ["Movement", "Combat", "General"] }
 * Grouped database: { "Weapon": { "Greatsword": ["General", "Strike", ...], ... } }
 */
export type FlatDatabase = string[];
export type GroupedDatabase = Record<string, string[]>;
export type DatabaseStructure = Record<string, FlatDatabase | GroupedDatabase>;

/**
 * Override map types
 *
 * Flat override map: { "Character": { "Movement": true, "Combat": false, ... } }
 * Grouped override map: { "Weapon": { "Greatsword": { "General": true, "Strike": false }, ... } }
 */
export type FlatOverrideMap = Record<string, boolean>;
export type GroupedOverrideMap = Record<string, Record<string, boolean>>;
export type OverrideMap = Record<string, FlatOverrideMap | GroupedOverrideMap>;

/**
 * Check if a directory contains only subdirectories (no JSON files directly)
 * This indicates it's a database group (like Weapon/) rather than a flat database (like Character/)
 */
async function isGroupDirectory(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const hasJsonFiles = entries.some((entry) => entry.isFile() && entry.name.endsWith('.json'));
    const hasSubdirs = entries.some((entry) => entry.isDirectory());
    // It's a group if it has subdirectories but no JSON files directly
    return !hasJsonFiles && hasSubdirs;
  } catch {
    return false;
  }
}

/**
 * Get category names from a database directory
 * Categories are JSON files without the .json extension
 */
async function getCategoriesFromDir(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace('.json', ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Scan a grouped database directory (like Weapon/) to get subdatabases and their categories
 */
async function scanGroupedDatabase(dirPath: string): Promise<GroupedDatabase> {
  const result: GroupedDatabase = {};

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const subdirs = entries.filter((entry) => entry.isDirectory());

    for (const subdir of subdirs) {
      const subdirPath = join(dirPath, subdir.name);
      const categories = await getCategoriesFromDir(subdirPath);
      // Only include subdatabases that have at least one category
      if (categories.length > 0) {
        result[subdir.name] = categories;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return result;
}

/**
 * Scan the entire Databases directory structure
 *
 * Returns a structure like:
 * {
 *   "Character": ["Movement", "Combat", "General"],
 *   "Weapon": {
 *     "Greatsword": ["General", "Strike", "AltStrike", "Stab", "AltStab"],
 *     "Longsword": ["General", "Strike", "AltStrike", "Stab", "AltStab"]
 *   }
 * }
 */
export async function scanDatabaseStructure(): Promise<DatabaseStructure> {
  const root = getDatabasesRoot();
  const structure: DatabaseStructure = {};

  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return structure;
    }
  } catch {
    // Databases directory doesn't exist yet
    return structure;
  }

  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());

    for (const dir of dirs) {
      const dirPath = join(root, dir.name);

      if (await isGroupDirectory(dirPath)) {
        // This is a grouped database (like Weapon/)
        const grouped = await scanGroupedDatabase(dirPath);
        // Only include if it has at least one subdatabase with categories
        if (Object.keys(grouped).length > 0) {
          structure[dir.name] = grouped;
        }
      } else {
        // This is a flat database (like Character/)
        const categories = await getCategoriesFromDir(dirPath);
        // Only include if it has at least one category
        if (categories.length > 0) {
          structure[dir.name] = categories;
        }
      }
    }
  } catch {
    // Can't read root directory
  }

  return structure;
}

/**
 * Check if a JSON file has non-empty content (at least one key-value pair)
 */
async function hasOverrides(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}

/**
 * Get override status for categories in a database directory
 */
async function getCategoryOverrides(dirPath: string): Promise<FlatOverrideMap> {
  const result: FlatOverrideMap = {};

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));

    for (const file of jsonFiles) {
      const categoryName = file.name.replace('.json', '');
      const filePath = join(dirPath, file.name);
      result[categoryName] = await hasOverrides(filePath);
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return result;
}

/**
 * Scan a grouped database directory for override status
 */
async function scanGroupedOverrides(dirPath: string): Promise<GroupedOverrideMap> {
  const result: GroupedOverrideMap = {};

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const subdirs = entries.filter((entry) => entry.isDirectory());

    for (const subdir of subdirs) {
      const subdirPath = join(dirPath, subdir.name);
      const categoryOverrides = await getCategoryOverrides(subdirPath);
      // Only include subdatabases that have at least one category
      if (Object.keys(categoryOverrides).length > 0) {
        result[subdir.name] = categoryOverrides;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return result;
}

/**
 * Scan the entire Databases directory for override presence
 *
 * Returns a structure like:
 * {
 *   "Character": { "Movement": true, "Combat": false, "General": false },
 *   "Weapon": {
 *     "Greatsword": { "General": true, "Strike": false, ... },
 *     "Longsword": { "General": false, "Strike": false, ... }
 *   }
 * }
 */
export async function scanOverrides(): Promise<OverrideMap> {
  const root = getDatabasesRoot();
  const overrides: OverrideMap = {};

  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return overrides;
    }
  } catch {
    // Databases directory doesn't exist yet
    return overrides;
  }

  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());

    for (const dir of dirs) {
      const dirPath = join(root, dir.name);

      if (await isGroupDirectory(dirPath)) {
        // This is a grouped database (like Weapon/)
        const grouped = await scanGroupedOverrides(dirPath);
        // Only include if it has at least one subdatabase
        if (Object.keys(grouped).length > 0) {
          overrides[dir.name] = grouped;
        }
      } else {
        // This is a flat database (like Character/)
        const categoryOverrides = await getCategoryOverrides(dirPath);
        // Only include if it has at least one category
        if (Object.keys(categoryOverrides).length > 0) {
          overrides[dir.name] = categoryOverrides;
        }
      }
    }
  } catch {
    // Can't read root directory
  }

  return overrides;
}

/**
 * Read all config data from disk in PresetData format
 *
 * Returns a structure like:
 * {
 *   "character": { "Movement": { "key": value, ... }, ... },
 *   "weapons": { "Greatsword": { "General": { "key": value, ... }, ... }, ... }
 * }
 */
export async function readAllConfigData(): Promise<PresetData> {
  const root = getDatabasesRoot();
  const data: PresetData = {
    character: {},
    weapons: {},
  };

  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return data;
    }
  } catch {
    // Databases directory doesn't exist yet
    return data;
  }

  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());

    for (const dir of dirs) {
      const dirPath = join(root, dir.name);

      if (dir.name === 'Character') {
        // Flat database - read category files directly
        const categoryFiles = await readdir(dirPath, { withFileTypes: true });
        for (const file of categoryFiles) {
          if (file.isFile() && file.name.endsWith('.json')) {
            const categoryName = file.name.replace('.json', '');
            const filePath = join(dirPath, file.name);
            try {
              const content = await readFile(filePath, 'utf-8');
              const parsed = JSON.parse(content);
              if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
                data.character[categoryName] = parsed as Record<string, ConfigValue>;
              }
            } catch {
              // Skip invalid files
            }
          }
        }
      } else if (dir.name === 'Weapon') {
        // Grouped database - read subdirectories
        const weaponDirs = await readdir(dirPath, { withFileTypes: true });
        for (const weaponDir of weaponDirs) {
          if (weaponDir.isDirectory()) {
            const weaponPath = join(dirPath, weaponDir.name);
            const categoryFiles = await readdir(weaponPath, { withFileTypes: true });

            for (const file of categoryFiles) {
              if (file.isFile() && file.name.endsWith('.json')) {
                const categoryName = file.name.replace('.json', '');
                const filePath = join(weaponPath, file.name);
                try {
                  const content = await readFile(filePath, 'utf-8');
                  const parsed = JSON.parse(content);
                  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
                    if (!data.weapons[weaponDir.name]) {
                      data.weapons[weaponDir.name] = {};
                    }
                    data.weapons[weaponDir.name][categoryName] = parsed as Record<string, ConfigValue>;
                  }
                } catch {
                  // Skip invalid files
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // Can't read root directory
  }

  return data;
}
