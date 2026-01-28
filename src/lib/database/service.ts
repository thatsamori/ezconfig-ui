/**
 * Database service layer for JSON file storage
 *
 * Handles reading and writing config entries to JSON files on the filesystem.
 * The web app is the authoritative source for all user configuration.
 */

import { mkdir, readFile, writeFile, stat, readdir, unlink, rmdir, rm } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { env } from '@/lib/env';
import type { ConfigData } from './types';
import { CategoryName } from '@/lib/config/weaponConfigSchema';

// Set of known weapon names for routing to Weapon/ directory
const WEAPON_NAMES: Set<string> = new Set(Object.values(CategoryName));

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

  // For known weapon names, default to Weapon/ subdirectory
  // This ensures new weapon configs go to the right place
  if (WEAPON_NAMES.has(database)) {
    // Create under Databases/Weapon/{database}/{category}.json
    return resolve(weaponFilePath);
  }

  // Default to direct path for new non-weapon databases
  // This allows creating new databases directly under Databases/
  return resolve(directFilePath);
}

/**
 * Clean up empty directories after file deletion
 * Walks up the directory tree and removes empty directories
 * Stops at the databases root to avoid deleting it
 */
async function cleanupEmptyDirectories(dirPath: string): Promise<void> {
  const root = getDatabasesRoot();
  const resolvedRoot = resolve(root);
  let currentDir = resolve(dirPath);

  // Walk up the directory tree
  while (currentDir !== resolvedRoot && currentDir.startsWith(resolvedRoot)) {
    try {
      const entries = await readdir(currentDir);
      if (entries.length === 0) {
        await rmdir(currentDir);
        currentDir = dirname(currentDir);
      } else {
        // Directory not empty, stop cleanup
        break;
      }
    } catch {
      // Directory doesn't exist or can't be read, stop cleanup
      break;
    }
  }
}

/**
 * Read config data from a category file
 * Returns an empty object if the file doesn't exist
 */
export async function readCategory(database: string, category: string): Promise<ConfigData> {
  const filePath = await resolveCategoryPath(database, category);

  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid category file format: expected object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
    }

    return parsed as ConfigData;
  } catch (error) {
    // File doesn't exist or is invalid - return empty object
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Write config data to a category file
 * Creates parent directories if they don't exist
 * Deletes the file if data is empty (on-demand storage)
 */
export async function writeCategory(
  database: string,
  category: string,
  data: ConfigData
): Promise<void> {
  const filePath = await resolveCategoryPath(database, category);
  const dir = dirname(filePath);

  // On-demand storage: delete file if data is empty
  if (Object.keys(data).length === 0) {
    try {
      await unlink(filePath);
      // Clean up empty parent directories
      await cleanupEmptyDirectories(dir);
    } catch (error) {
      // Ignore ENOENT - file already doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    return;
  }

  // Create parent directories if needed
  await mkdir(dir, { recursive: true });

  // Write with pretty formatting (2-space indent)
  const content = JSON.stringify(data, null, 2);
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

/**
 * Clear all database files by removing all directories under Databases/
 * Used when loading a preset to start fresh
 */
export async function clearAllDatabases(): Promise<void> {
  const root = getDatabasesRoot();

  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = join(root, entry.name);
        await rm(dirPath, { recursive: true, force: true });
      }
    }
  } catch (error) {
    // Root directory might not exist yet, which is fine
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

// Test code - runs when executed directly with `bun run`
if (import.meta.main) {
  const { unlink, rm } = await import('fs/promises');

  console.log('Running database service tests...\n');

  const testDatabase = 'Test';
  const testCategory = 'General';
  const testData: ConfigData = { TestKey: true, AnotherKey: 42 };

  try {
    // Test 1: Write test data
    console.log('Test 1: Writing test data...');
    await writeCategory(testDatabase, testCategory, testData);
    console.log('  PASS: Write succeeded\n');

    // Test 2: Read test data
    console.log('Test 2: Reading test data...');
    const readData = await readCategory(testDatabase, testCategory);
    if (JSON.stringify(readData) === JSON.stringify(testData)) {
      console.log('  PASS: Read data matches written data\n');
    } else {
      console.log('  FAIL: Read data does not match');
      console.log('  Expected:', JSON.stringify(testData));
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

    // Test 4: Read non-existent file returns empty object
    console.log('Test 4: Reading non-existent category...');
    const emptyData = await readCategory('NonExistent', 'Category');
    if (typeof emptyData === 'object' && !Array.isArray(emptyData) && Object.keys(emptyData).length === 0) {
      console.log('  PASS: Non-existent file returns empty object\n');
    } else {
      console.log('  FAIL: Expected empty object, got:', emptyData);
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

    // Test 6: Writing empty object deletes file (on-demand storage)
    console.log('Test 6: Writing empty object deletes file...');
    // First verify file still exists from Test 1
    if (!(await categoryExists(testDatabase, testCategory))) {
      console.log('  FAIL: Test file should still exist');
      process.exit(1);
    }
    // Write empty object - should delete the file
    await writeCategory(testDatabase, testCategory, {});
    if (await categoryExists(testDatabase, testCategory)) {
      console.log('  FAIL: File should be deleted after writing empty object');
      process.exit(1);
    }
    // Read should still return empty object
    const afterDelete = await readCategory(testDatabase, testCategory);
    if (Object.keys(afterDelete).length !== 0) {
      console.log('  FAIL: Read after delete should return empty object');
      process.exit(1);
    }
    console.log('  PASS: Empty write deletes file, read returns {}\n');

    // Test 7: Empty directory cleanup
    console.log('Test 7: Empty directory cleanup...');
    const nestedDatabase = 'TestWeapon';
    const nestedCategory = 'General';
    const nestedData: ConfigData = { TestKey: true };
    // Write to create nested directory structure
    await writeCategory(nestedDatabase, nestedCategory, nestedData);
    const nestedFilePath = await resolveCategoryPath(nestedDatabase, nestedCategory);
    const nestedDir = dirname(nestedFilePath);
    // Verify file exists
    if (!(await categoryExists(nestedDatabase, nestedCategory))) {
      console.log('  FAIL: Nested file should exist');
      process.exit(1);
    }
    // Write empty object to delete file and trigger directory cleanup
    await writeCategory(nestedDatabase, nestedCategory, {});
    // Verify file is deleted
    if (await categoryExists(nestedDatabase, nestedCategory)) {
      console.log('  FAIL: Nested file should be deleted');
      process.exit(1);
    }
    // Verify parent directory is also deleted
    try {
      await stat(nestedDir);
      console.log('  FAIL: Empty parent directory should be deleted');
      process.exit(1);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('  PASS: Empty directories cleaned up\n');
      } else {
        console.log('  FAIL: Unexpected error checking directory:', (error as Error).message);
        process.exit(1);
      }
    }

    // Cleanup: Remove any leftover test directories
    console.log('Cleanup: Removing any leftover test files...');
    try {
      await rm(join(getDatabasesRoot(), testDatabase), { recursive: true, force: true });
    } catch { /* ignore */ }
    try {
      await rm(join(getDatabasesRoot(), nestedDatabase), { recursive: true, force: true });
    } catch { /* ignore */ }
    console.log('  Cleanup complete\n');

    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}
