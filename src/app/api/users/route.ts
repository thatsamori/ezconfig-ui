/**
 * User management API endpoints
 *
 * GET /api/users - List all users (without passwords)
 * POST /api/users - Create new user
 *
 * Requires global_admin role.
 */

import { NextResponse } from 'next/server';
import { validateToken } from '@/lib/auth/tokens';
import { getUsers, saveUsers } from '@/lib/auth/service';
import type { UserRole } from '@/lib/auth/types';

const VALID_ROLES: UserRole[] = ['viewer', 'preset_creator', 'config_editor', 'global_admin'];

/**
 * GET /api/users
 * List all users (without passwords)
 */
export async function GET(request: Request) {
  try {
    // Validate token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const userData = validateToken(token);

    if (!userData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check role
    if (userData.role !== 'global_admin') {
      return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 });
    }

    // Get users and strip passwords
    const users = await getUsers();
    const usersWithoutPasswords = users.map(({ password, ...rest }) => rest);

    return NextResponse.json({ users: usersWithoutPasswords });
  } catch (error) {
    console.error('Error listing users:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users
 * Create new user
 */
export async function POST(request: Request) {
  try {
    // Validate token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const userData = validateToken(token);

    if (!userData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check role
    if (userData.role !== 'global_admin') {
      return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 });
    }

    // Parse body
    const body = await request.json();
    const { username, password, role } = body;

    // Validate fields
    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.trim() === '') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Check for duplicate username
    const users = await getUsers();
    if (users.some((u) => u.username === username.trim())) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }

    // Create user
    const newUser = {
      username: username.trim(),
      password: password,
      role: role as UserRole,
    };

    users.push(newUser);
    await saveUsers(users);

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    return NextResponse.json({ user: userWithoutPassword }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
