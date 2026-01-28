/**
 * POST /api/notes/{schema}/delete
 *
 * Delete a note by ID (atomic operation)
 *
 * Request body: { configKey: string, noteId: string }
 * Response: { success: true, data: NotesData } or { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteNote } from '@/lib/notes/service';

const VALID_SCHEMAS = ['weapon', 'character'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schema: string }> }
) {
  try {
    const { schema } = await params;

    if (!VALID_SCHEMAS.includes(schema)) {
      return NextResponse.json(
        { success: false, error: `Invalid schema: "${schema}"` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { configKey, noteId } = body;

    if (typeof configKey !== 'string' || !configKey) {
      return NextResponse.json(
        { success: false, error: 'configKey is required' },
        { status: 400 }
      );
    }

    if (typeof noteId !== 'string' || !noteId) {
      return NextResponse.json(
        { success: false, error: 'noteId is required' },
        { status: 400 }
      );
    }

    const data = await deleteNote(schema, configKey, noteId);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
