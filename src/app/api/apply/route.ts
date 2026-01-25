/**
 * POST /api/apply
 *
 * Apply saved config to game via RCON.
 * Requires password authentication.
 *
 * Request body: { password: string }
 * Response: { success: boolean, commandsSent?: number, error?: string, failedAt?: string }
 */

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { applyConfig } from '@/lib/database/apply';

interface ApplyRequest {
  password: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApplyRequest;

    // Validate password
    if (!body.password || body.password !== env.ezconfigPassword) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if EZCONFIG_PASSWORD is configured
    if (!env.ezconfigPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'EZCONFIG_PASSWORD not configured on server',
        },
        { status: 500 }
      );
    }

    const result = await applyConfig();

    if (result.success) {
      return NextResponse.json({
        success: true,
        commandsSent: result.commandsSent,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          failedAt: result.failedAt,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in apply endpoint:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
