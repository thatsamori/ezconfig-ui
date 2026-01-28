/**
 * Notes service layer for JSON file storage
 *
 * Handles reading and writing notes to JSON files on the filesystem.
 * Notes are stored per-schema (weapon.json, character.json), with config keys as top-level index.
 * This means notes for a config key are shared across all categories where that key appears.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { env } from '@/lib/env';
import type { NotesData } from './types';
import { generateNoteId } from './types';

/**
 * Valid schema names
 */
const VALID_SCHEMAS = ['weapon', 'character'] as const;
type Schema = (typeof VALID_SCHEMAS)[number];

/**
 * Get the root path for notes
 */
export function getNotesRoot(): string {
  return env.notesPath;
}

/**
 * Validate that a schema name is valid
 * Throws an error if schema is invalid
 */
function validateSchema(schema: string): asserts schema is Schema {
  if (!VALID_SCHEMAS.includes(schema as Schema)) {
    throw new Error(`Invalid schema: "${schema}". Must be one of: ${VALID_SCHEMAS.join(', ')}`);
  }
}


/**
 * Resolve the full filesystem path for a notes file.
 *
 * Notes use per-schema storage: Notes/{schema}.json
 * Example: Notes/weapon.json, Notes/character.json
 */
export function resolveNotesPath(schema: string): string {
  validateSchema(schema);
  const root = getNotesRoot();
  const filePath = join(root, `${schema}.json`);
  return resolve(filePath);
}

/**
 * Read notes data from a schema file
 * Returns an empty object if the file doesn't exist
 */
export async function readNotes(schema: string): Promise<NotesData> {
  const filePath = resolveNotesPath(schema);

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
 * Write notes data to a schema file
 * Creates parent directories if they don't exist
 */
export async function writeNotes(
  schema: string,
  data: NotesData
): Promise<void> {
  const filePath = resolveNotesPath(schema);
  const dir = dirname(filePath);

  // Create parent directories if needed
  await mkdir(dir, { recursive: true });

  // Write with pretty formatting (2-space indent)
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Add a note to a config key (atomic operation)
 * Returns the updated notes data with the new note (including generated ID)
 */
export async function addNote(
  schema: string,
  configKey: string,
  note: { createdBy: string; note: string }
): Promise<NotesData> {
  const data = await readNotes(schema);
  const notes = data[configKey] || [];
  const newNote = {
    id: generateNoteId(),
    createdBy: note.createdBy,
    note: note.note,
  };
  notes.push(newNote);
  data[configKey] = notes;
  await writeNotes(schema, data);
  return data;
}

/**
 * Edit a note by ID (atomic operation)
 * Returns the updated notes data, or throws if note not found
 */
export async function editNote(
  schema: string,
  configKey: string,
  noteId: string,
  newNote: string
): Promise<NotesData> {
  const data = await readNotes(schema);
  const notes = data[configKey];

  if (!notes) {
    throw new Error(`No notes found for key "${configKey}"`);
  }

  const noteIndex = notes.findIndex((n) => n.id === noteId);
  if (noteIndex === -1) {
    throw new Error(`Note with id "${noteId}" not found for key "${configKey}"`);
  }

  notes[noteIndex] = { ...notes[noteIndex], note: newNote };
  await writeNotes(schema, data);
  return data;
}

/**
 * Delete a note by ID (atomic operation)
 * Returns the updated notes data, or throws if note not found
 */
export async function deleteNote(
  schema: string,
  configKey: string,
  noteId: string
): Promise<NotesData> {
  const data = await readNotes(schema);
  const notes = data[configKey];

  if (!notes) {
    throw new Error(`No notes found for key "${configKey}"`);
  }

  const noteIndex = notes.findIndex((n) => n.id === noteId);
  if (noteIndex === -1) {
    throw new Error(`Note with id "${noteId}" not found for key "${configKey}"`);
  }

  notes.splice(noteIndex, 1);

  // Remove the key entirely if no notes left
  if (notes.length === 0) {
    delete data[configKey];
  }

  await writeNotes(schema, data);
  return data;
}
