/**
 * Notes service layer for JSON file storage
 *
 * Handles reading and writing notes to JSON files on the filesystem.
 * Notes are stored separately from config data, allowing users to annotate config options.
 */

import { mkdir, readFile, writeFile, readdir, unlink, rmdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { env } from '@/lib/env';
import type { NotesData } from './types';

/**
 * Get the root path for notes
 */
export function getNotesRoot(): string {
  return env.notesPath;
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
 * Resolve the full filesystem path for a notes file.
 *
 * Notes use a simpler structure than config - direct path only.
 * Example: Notes/Character/Movement.json or Notes/Weapon/Greatsword/General.json
 */
export function resolveNotesPath(database: string, category: string): string {
  validatePathSecurity(database, category);

  const root = getNotesRoot();
  const filePath = join(root, database, `${category}.json`);

  return resolve(filePath);
}

/**
 * Clean up empty directories after file deletion
 * Walks up the directory tree and removes empty directories
 * Stops at the notes root to avoid deleting it
 */
async function cleanupEmptyDirectories(dirPath: string): Promise<void> {
  const root = getNotesRoot();
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
 * Read notes data from a category file
 * Returns an empty object if the file doesn't exist
 */
export async function readNotes(database: string, category: string): Promise<NotesData> {
  const filePath = resolveNotesPath(database, category);

  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid notes file format: expected object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
    }

    return parsed as NotesData;
  } catch (error) {
    // File doesn't exist or is invalid - return empty object
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/**
 * Write notes data to a category file
 * Creates parent directories if they don't exist
 * Deletes the file if data is empty (on-demand storage)
 */
export async function writeNotes(
  database: string,
  category: string,
  data: NotesData
): Promise<void> {
  const filePath = resolveNotesPath(database, category);
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
