/**
 * User Presets API
 *
 * POST /api/presets/user - Create a new user preset
 * GET /api/presets/user - List all user presets
 */

import { NextRequest, NextResponse } from 'next/server';
import { listUserPresets, saveUserPreset } from '@/lib/presets';
import { readAllConfigData } from '@/lib/database/structure';

interface CreatePresetBody {
  name: string;
  title: string;
  description: string;
  // data field is now ignored - we read from disk instead
  data?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreatePresetBody;

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Preset name is required' },
        { status: 400 }
      );
    }

    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Preset title is required' },
        { status: 400 }
      );
    }

    // Read current config data directly from disk
    // This ensures we capture ALL saved configs, not just what's loaded in memory
    const diskData = await readAllConfigData();

    const manifest = {
      title: body.title,
      description: body.description || '',
    };

    await saveUserPreset(body.name, manifest, diskData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating user preset:', error);

    const message = error instanceof Error ? error.message : 'Unknown error creating preset';
    const status = message.includes('required') || message.includes('can only contain') ? 400 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function GET() {
  try {
    const presets = await listUserPresets();

    return NextResponse.json({
      success: true,
      data: presets,
    });
  } catch (error) {
    console.error('Error listing user presets:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error listing user presets',
      },
      { status: 500 }
    );
  }
}
