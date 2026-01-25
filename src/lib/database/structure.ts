/**
 * Database structure scanning service
 *
 * Scans the Databases directory to build a structure map showing
 * all databases, subdatabases (for grouped types like Weapon), and categories.
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { getDatabasesRoot } from './service';

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
