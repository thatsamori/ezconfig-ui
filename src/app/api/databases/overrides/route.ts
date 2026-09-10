/**
 * GET /api/databases/overrides
 *
 * Returns a map showing which databases/categories have non-empty overrides.
 * Used by the UI to filter weapons when "Show overrides only" is enabled.
 */

import { NextResponse } from 'next/server';
import { scanOverrides, readAllConfigData } from '@/lib/database/structure';
import { readConfigRevision, withConfigLock } from '@/lib/database/revision';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { overrides, values, metadata } = await withConfigLock(async () => {
      const [overrides, values, metadata] = await Promise.all([scanOverrides(), readAllConfigData(), readConfigRevision()]);
      return { overrides, values, metadata };
    });

    return NextResponse.json({
      success: true,
      data: overrides,
      values,
      ...metadata,
    }, { headers: { 'Cache-Control': 'no-store' } });
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
