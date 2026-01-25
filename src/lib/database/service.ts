/**
 * Database service layer for JSON file storage
 *
 * Handles reading and writing config entries to JSON files on the filesystem.
 * The web app is the authoritative source for all user configuration.
 */

import { mkdir, readFile, writeFile, stat, readdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { env } from '@/lib/env';
import type { ConfigEntry } from './types';

/**
 * Get the root path for databases
 */
export function getDatabasesRoot(): string {
  return env.databasesPath;
}

/**
 * Validate that a path does not contain path traversal attacks
 * Throws an error if path contains '..' or other traversal patterns
 */
function validatePathSecurity(database: string, category: string): void {
  const dangerous = ['..', '\\..', '../', '..\\'];
  const combined = `${database}/${category}`;

  for (const pattern of dangerous) {
    if (combined.includes(pattern)) {
      throw new Error(`Invalid path: path traversal detected in "${combined}"`);
    }
  }

  // Also check for absolute paths that could escape
  if (database.startsWith('/') || database.startsWith('\\') || database.includes(':')) {
    throw new Error(`Invalid path: absolute paths not allowed in "${database}"`);
  }
  if (category.startsWith('/') || category.startsWith('\\') || category.includes(':')) {
    throw new Error(`Invalid path: absolute paths not allowed in "${category}"`);
  }
}

/**
 * Check if a directory contains JSON files directly (making it a Database)
 * or only subdirectories (making it a Database Group)
 */
async function containsJsonFiles(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith('.json'));
  } catch {
    return false;
  }
}

/**
 * Resolve the full filesystem path for a category file.
 *
 * Handles both flat and nested database structures:
 * - Flat: Databases/Character/Movement.json
 * - Nested: Databases/Weapon/Greatsword/General.json
 *
 * The database parameter is the URL path component (e.g., "Character" or "Greatsword").
 * For nested databases (weapons), we check if Databases/{database} exists as a direct
 * database, otherwise we look under Databases/Weapon/{database}.
 */
export async function resolveCategoryPath(database: string, category: string): Promise<string> {
  validatePathSecurity(database, category);

  const root = getDatabasesRoot();

  // First, try the direct path: Databases/{database}/{category}.json
  const directPath = join(root, database);
  const directFilePath = join(directPath, `${category}.json`);

  try {
    const directStat = await stat(directPath);
    if (directStat.isDirectory()) {
      // Check if this directory contains JSON files (is a database)
      // or only subdirectories (is a database group)
      if (await containsJsonFiles(directPath)) {
        return resolve(directFilePath);
      }
    }
  } catch {
    // Directory doesn't exist yet, check if it might be under Weapon/
  }

  // If direct path doesn't exist or is a group, try under Weapon/
  const weaponPath = join(root, 'Weapon', database);
  const weaponFilePath = join(weaponPath, `${category}.json`);

  try {
    const weaponStat = await stat(weaponPath);
    if (weaponStat.isDirectory()) {
      return resolve(weaponFilePath);
    }
  } catch {
    // Weapon subdirectory doesn't exist
  }

  // Default to direct path for new databases
  // This allows creating new databases directly under Databases/
  return resolve(directFilePath);
}

/**
 * Read config entries from a category file
 * Returns an empty array if the file doesn't exist
 */
export async function readCategory(database: string, category: string): Promise<ConfigEntry[]> {
  const filePath = await resolveCategoryPath(database, category);

  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid category file format: expected array, got ${typeof parsed}`);
    }

    return parsed as ConfigEntry[];
  } catch (error) {
    // File doesn't exist or is invalid - return empty array
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Write config entries to a category file
 * Creates parent directories if they don't exist
 */
export async function writeCategory(
  database: string,
  category: string,
  entries: ConfigEntry[]
): Promise<void> {
  const filePath = await resolveCategoryPath(database, category);

  // Create parent directories if needed
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  // Write with pretty formatting (2-space indent)
  const content = JSON.stringify(entries, null, 2);
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Check if a category file exists
 */
export async function categoryExists(database: string, category: string): Promise<boolean> {
  const filePath = await resolveCategoryPath(database, category);

  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

// Test code - runs when executed directly with `bun run`
if (import.meta.main) {
  const { unlink, rm } = await import('fs/promises');

  console.log('Running database service tests...\n');

  const testDatabase = 'Test';
  const testCategory = 'General';
  const testEntry: ConfigEntry[] = [{ TestKey: true }];

  try {
    // Test 1: Write test data
    console.log('Test 1: Writing test data...');
    await writeCategory(testDatabase, testCategory, testEntry);
    console.log('  PASS: Write succeeded\n');

    // Test 2: Read test data
    console.log('Test 2: Reading test data...');
    const readData = await readCategory(testDatabase, testCategory);
    if (JSON.stringify(readData) === JSON.stringify(testEntry)) {
      console.log('  PASS: Read data matches written data\n');
    } else {
      console.log('  FAIL: Read data does not match');
      console.log('  Expected:', JSON.stringify(testEntry));
      console.log('  Got:', JSON.stringify(readData));
      process.exit(1);
    }

    // Test 3: Category exists check
    console.log('Test 3: Checking categoryExists...');
    const exists = await categoryExists(testDatabase, testCategory);
    if (exists) {
      console.log('  PASS: categoryExists returns true for existing file\n');
    } else {
      console.log('  FAIL: categoryExists returned false for existing file');
      process.exit(1);
    }

    // Test 4: Read non-existent file returns empty array
    console.log('Test 4: Reading non-existent category...');
    const emptyData = await readCategory('NonExistent', 'Category');
    if (Array.isArray(emptyData) && emptyData.length === 0) {
      console.log('  PASS: Non-existent file returns empty array\n');
    } else {
      console.log('  FAIL: Expected empty array, got:', emptyData);
      process.exit(1);
    }

    // Test 5: Path traversal prevention
    console.log('Test 5: Testing path traversal prevention...');
    try {
      await readCategory('../etc', 'passwd');
      console.log('  FAIL: Path traversal was not prevented');
      process.exit(1);
    } catch (error) {
      if ((error as Error).message.includes('path traversal')) {
        console.log('  PASS: Path traversal correctly rejected\n');
      } else {
        console.log('  FAIL: Unexpected error:', (error as Error).message);
        process.exit(1);
      }
    }

    // Cleanup: Delete test file and directory
    console.log('Cleanup: Removing test files...');
    const filePath = await resolveCategoryPath(testDatabase, testCategory);
    await unlink(filePath);
    await rm(dirname(filePath), { recursive: true });
    console.log('  Cleanup complete\n');

    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}
