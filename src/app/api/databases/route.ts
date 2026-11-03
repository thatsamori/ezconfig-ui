/**
 * GET /api/databases
 *
 * Returns the database structure showing all available databases,
 * subdatabases (for grouped types like Weapon), and categories.
 */

import { NextResponse } from 'next/server';
import { scanDatabaseStructure } from '@/lib/database/structure';
import { requireSession } from '@/lib/platform/auth';

export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const structure = await scanDatabaseStructure();

    return NextResponse.json({
      success: true,
      data: structure,
    });
  } catch (error) {
    console.error('Error scanning database structure:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error scanning databases',
      },
      { status: 500 }
    );
  }
}
