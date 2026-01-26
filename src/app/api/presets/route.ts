/**
 * GET /api/presets
 *
 * Returns the list of available static presets with their manifests.
 */

import { NextResponse } from 'next/server';
import { listStaticPresets } from '@/lib/presets';

export async function GET() {
  try {
    const presets = await listStaticPresets();

    return NextResponse.json({
      success: true,
      data: presets,
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
