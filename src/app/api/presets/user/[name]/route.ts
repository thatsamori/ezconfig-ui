/**
 * User Preset by Name API
 *
 * GET /api/presets/user/[name] - Get user preset data
 * DELETE /api/presets/user/[name] - Delete a user preset
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteUserPreset, loadUserPresetData } from '@/lib/presets';

interface RouteParams {
  params: Promise<{ name: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Preset name is required' },
        { status: 400 }
      );
    }

    const data = await loadUserPresetData(name);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error loading user preset:', error);

    const message = error instanceof Error ? error.message : 'Unknown error loading preset';

    let status = 500;
    if (message.includes('not found')) {
      status = 404;
    } else if (message.includes('required') || message.includes('can only contain') || message.includes('path traversal')) {
      status = 400;
    }

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Preset name is required' },
        { status: 400 }
      );
    }

    await deleteUserPreset(name);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user preset:', error);

    const message = error instanceof Error ? error.message : 'Unknown error deleting preset';

    // Determine appropriate status code
    let status = 500;
    if (message.includes('not found')) {
      status = 404;
    } else if (message.includes('required') || message.includes('can only contain') || message.includes('path traversal')) {
      status = 400;
    }

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
