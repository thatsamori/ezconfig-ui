/**
 * GET /api/databases/overrides
 *
 * Returns a map showing which databases/categories have non-empty overrides.
 * Used by the UI to filter weapons when "Show overrides only" is enabled.
 */

import { NextResponse } from 'next/server';
import { scanOverrides } from '@/lib/database/structure';

export async function GET() {
  try {
    const overrides = await scanOverrides();

    return NextResponse.json({
      success: true,
      data: overrides,
    });
  } catch (error) {
    console.error('Error scanning overrides:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error scanning overrides',
      },
      { status: 500 }
    );
  }
}
