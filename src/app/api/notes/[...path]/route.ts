/**
 * Notes API route handler
 *
 * GET /api/notes/{database}/{category} - Read notes for a category
 * POST /api/notes/{database}/{category} - Write notes for a category
 *
 * The last path segment is the category, everything before is the database path.
 * Examples:
 *   /api/notes/Character/Movement -> database="Character", category="Movement"
 *   /api/notes/Weapon/Greatsword/Strike -> database="Weapon/Greatsword", category="Strike"
 */

import { NextRequest, NextResponse } from 'next/server';
import { readNotes, writeNotes } from '@/lib/notes/service';
import type { NotesData, Note } from '@/lib/notes/types';

/**
 * Parse path segments into database and category
 * Last segment is always the category, rest is the database path
 */
function parsePath(pathSegments: string[]): { database: string; category: string } | null {
  if (!pathSegments || pathSegments.length < 2) {
    return null;
  }

  // Last segment is the category
  const category = pathSegments[pathSegments.length - 1];
  // Everything else is the database path (join with / for nested paths)
  const database = pathSegments.slice(0, -1).join('/');

  return { database, category };
}

/**
 * Validate that a value is a valid Note object
 */
function isValidNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.createdBy === 'string' && typeof obj.note === 'string';
}

/**
 * Validate that a value is valid NotesData
 */
function isValidNotesData(value: unknown): value is NotesData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const notes = obj[key];
    if (!Array.isArray(notes)) {
      return false;
    }
    for (const note of notes) {
      if (!isValidNote(note)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * GET /api/notes/{database}/{category}
 *
 * Read notes from a category file.
 * Returns empty object if file doesn't exist.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const parsed = parsePath(pathSegments);

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Invalid path: expected /api/notes/{database}/{category}' },
        { status: 400 }
      );
    }

    const { database, category } = parsed;
    const notes = await readNotes(database, category);

    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/notes/{database}/{category}
 *
 * Write notes to a category file.
 * Replaces all notes for the category with the provided data.
 *
 * Request body: { notes: NotesData }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const parsed = parsePath(pathSegments);

    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Invalid path: expected /api/notes/{database}/{category}' },
        { status: 400 }
      );
    }

    const { database, category } = parsed;

    // Parse request body
    let body: { notes?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    if (!body.notes || !isValidNotesData(body.notes)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Request body must contain "notes" object with valid Note arrays',
        },
        { status: 400 }
      );
    }

    // Write to file
    await writeNotes(database, category, body.notes);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
