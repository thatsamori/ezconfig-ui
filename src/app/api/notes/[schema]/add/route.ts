/**
 * POST /api/notes/{schema}/add
 *
 * Add a note to a config key (atomic operation)
 *
 * Request body: { configKey: string, note: string, createdBy: string }
 * Response: { success: true, data: NotesData } or { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { addNote } from '@/lib/notes/service';

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
    const { configKey, note, createdBy } = body;

    if (typeof configKey !== 'string' || !configKey) {
      return NextResponse.json(
        { success: false, error: 'configKey is required' },
        { status: 400 }
      );
    }

    if (typeof note !== 'string') {
      return NextResponse.json(
        { success: false, error: 'note is required' },
        { status: 400 }
      );
    }

    if (typeof createdBy !== 'string' || !createdBy) {
      return NextResponse.json(
        { success: false, error: 'createdBy is required' },
        { status: 400 }
      );
    }

    const data = await addNote(schema, configKey, { createdBy, note });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
