/**
 * POST /api/auth/login
 *
 * Authenticate user and return session token.
 *
 * Request body: { username: string, password: string }
 * Response: { success: boolean, token?: string, user?: { username, role }, error?: string }
 */

import { NextResponse } from 'next/server';
import { bootstrapAdmin, validateCredentials, generateToken } from '@/lib/auth/service';
import { storeToken } from '@/lib/auth/tokens';

interface LoginRequest {
  username: string;
  password: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequest;

    // Validate request
    if (!body.username || !body.password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Bootstrap admin if needed (on first login attempt)
    await bootstrapAdmin();

    // Validate credentials
    const user = await validateCredentials(body.username, body.password);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate and store token
    const token = generateToken();
    storeToken(token, user);

    return NextResponse.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error in login endpoint:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
