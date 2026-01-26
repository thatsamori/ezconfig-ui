/**
 * User Preset by Name API
 *
 * DELETE /api/presets/user/[name] - Delete a user preset
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteUserPreset } from '@/lib/presets';

interface RouteParams {
  params: Promise<{ name: string }>;
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
