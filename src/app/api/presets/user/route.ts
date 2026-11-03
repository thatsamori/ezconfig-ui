/**
 * User Presets API
 *
 * POST /api/presets/user - Create a new user preset from one of the owner's Drafts
 * GET /api/presets/user - List all user presets
 */

import { NextRequest, NextResponse } from 'next/server';
import { listUserPresets, saveUserPreset } from '@/lib/presets';
import { placeValues } from '@/lib/config/valuesDocument';
import { findOwnedDraft } from '@/lib/platform/drafts';
import { requireSession } from '@/lib/platform/auth';

interface CreatePresetBody {
  name: string;
  title: string;
  description: string;
  /** The game server whose saved Draft the preset snapshots. */
  gameServerId: number;
}

export async function POST(request: NextRequest) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
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

    // The Draft as saved, placed under current categories, not what a tab holds in memory
    const draft = findOwnedDraft(session.user.id, String(body.gameServerId));
    if (!draft) {
      return NextResponse.json(
        { success: false, error: 'No such game server' },
        { status: 404 }
      );
    }

    const manifest = {
      title: body.title,
      description: body.description || '',
    };

    await saveUserPreset(body.name, manifest, placeValues(draft.document).values);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating user preset:', error);

    const message = error instanceof Error ? error.message : 'Unknown error creating preset';
    const status = message.includes('required') || message.includes('can only contain') ? 400 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
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
