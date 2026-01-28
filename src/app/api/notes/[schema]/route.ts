/**
 * Notes API route handler
 *
 * GET /api/notes/{schema} - Read all notes for a schema
 * POST /api/notes/{schema} - Write all notes for a schema
 *
 * Schema must be "weapon" or "character".
 * Notes are stored per-schema with config keys as top-level index.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readNotes, writeNotes } from '@/lib/notes/service';
import type { NotesData, Note } from '@/lib/notes/types';

/**
 * Valid schema names
 */
const VALID_SCHEMAS = ['weapon', 'character'];

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
 * GET /api/notes/{schema}
 *
 * Read all notes for a schema.
 * Returns empty object if file doesn't exist.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schema: string }> }
) {
  try {
    const { schema } = await params;

    if (!VALID_SCHEMAS.includes(schema)) {
      return NextResponse.json(
        { success: false, error: `Invalid schema: "${schema}". Must be one of: ${VALID_SCHEMAS.join(', ')}` },
        { status: 400 }
      );
    }

    const notes = await readNotes(schema);

    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/notes/{schema}
 *
 * Write all notes for a schema.
 * Replaces all notes for the schema with the provided data.
 *
 * Request body: { notes: NotesData }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schema: string }> }
) {
  try {
    const { schema } = await params;

    if (!VALID_SCHEMAS.includes(schema)) {
      return NextResponse.json(
        { success: false, error: `Invalid schema: "${schema}". Must be one of: ${VALID_SCHEMAS.join(', ')}` },
        { status: 400 }
      );
    }

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
    await writeNotes(schema, body.notes);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
