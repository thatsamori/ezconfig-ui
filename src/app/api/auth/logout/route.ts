/**
 * POST /api/auth/logout
 *
 * Invalidate a session token.
 *
 * Request body: { token: string }
 * Response: { success: boolean }
 */

import { NextResponse } from 'next/server';
import { removeToken } from '@/lib/auth/tokens';

interface LogoutRequest {
  token: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LogoutRequest;

    if (body.token) {
      removeToken(body.token);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in logout endpoint:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
