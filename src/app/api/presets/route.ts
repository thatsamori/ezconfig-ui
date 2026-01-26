/**
 * GET /api/presets
 *
 * Returns the list of available presets (both static and user) with their manifests.
 */

import { NextResponse } from 'next/server';
import { listStaticPresets, listUserPresets } from '@/lib/presets';

export async function GET() {
  try {
    const [staticPresets, userPresets] = await Promise.all([
      listStaticPresets(),
      listUserPresets(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        static: staticPresets,
        user: userPresets,
      },
    });
  } catch (error) {
    console.error('Error listing presets:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error listing presets',
      },
      { status: 500 }
    );
  }
}
