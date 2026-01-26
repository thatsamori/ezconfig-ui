/**
 * GET /api/presets/[name]
 *
 * Returns the full data and manifest for a specific preset.
 */

import { NextResponse } from 'next/server';
import { loadPresetData, readPresetManifest, validatePresetName } from '@/lib/presets';

type RouteParams = {
  params: Promise<{ name: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const { name } = await params;

  // Validate preset name
  try {
    validatePresetName(name);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid preset name',
      },
      { status: 400 }
    );
  }

  try {
    const [data, manifest] = await Promise.all([
      loadPresetData(name),
      readPresetManifest(name),
    ]);

    return NextResponse.json({
      success: true,
      data,
      manifest,
    });
  } catch (error) {
    console.error(`Error loading preset "${name}":`, error);

    // Check if it's a "not found" error
    const message = error instanceof Error ? error.message : 'Unknown error loading preset';
    const isNotFound = message.includes('not found');

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
