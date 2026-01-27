/**
 * DELETE /api/config/clear
 *
 * Clears all database files. Used when loading a preset to start fresh.
 */

import { NextResponse } from 'next/server';
import { clearAllDatabases } from '@/lib/database/service';

export async function DELETE() {
  try {
    await clearAllDatabases();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
