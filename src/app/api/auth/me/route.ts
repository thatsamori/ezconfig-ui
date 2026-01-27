/**
 * GET /api/auth/me
 *
 * Get current user info from token.
 *
 * Headers: Authorization: Bearer <token>
 * Response: { authenticated: boolean, user?: { username, role } }
 */

import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/auth/tokens';

export async function GET(request: Request) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Validate token
    const userData = validateToken(token);

    if (!userData) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        username: userData.username,
        role: userData.role,
      },
    });
  } catch (error) {
    console.error('Error in me endpoint:', error);

    return NextResponse.json(
      {
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
