/**
 * Single user management API endpoints
 *
 * GET /api/users/[username] - Get user by username
 * PUT /api/users/[username] - Update user
 * DELETE /api/users/[username] - Delete user
 *
 * Requires admin role.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getUsers, saveUsers } from '@/lib/auth/service';
import type { UserRole } from '@/lib/auth/types';

const VALID_ROLES: UserRole[] = ['config_editor', 'admin'];

interface RouteContext {
  params: Promise<{ username: string }>;
}

/**
 * GET /api/users/[username]
 * Get single user by username (without password)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { username } = await context.params;

    // Check auth
    const auth = requireRole(request, ['admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error!.message }, { status: auth.error!.status });
    }

    // Find user
    const users = await getUsers();
    const user = users.find((u) => u.username === username);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Return without password
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Error getting user:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[username]
 * Update user (password and/or role)
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { username } = await context.params;

    // Check auth
    const auth = requireRole(request, ['admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error!.message }, { status: auth.error!.status });
    }

    // Parse body
    const body = await request.json();
    const { password, role } = body;

    // Validate role if provided
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate password if provided
    if (password !== undefined && (typeof password !== 'string' || password.trim() === '')) {
      return NextResponse.json({ error: 'Password cannot be empty' }, { status: 400 });
    }

    // Find and update user
    const users = await getUsers();
    const userIndex = users.findIndex((u) => u.username === username);

    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update fields
    if (password !== undefined) {
      users[userIndex].password = password;
    }
    if (role !== undefined) {
      users[userIndex].role = role as UserRole;
    }

    await saveUsers(users);

    // Return updated user without password
    const { password: _, ...userWithoutPassword } = users[userIndex];
    return NextResponse.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[username]
 * Delete user by username
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { username } = await context.params;

    // Check auth
    const auth = requireRole(request, ['admin']);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error!.message }, { status: auth.error!.status });
    }

    // Prevent self-deletion
    if (auth.user!.username === username) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    // Find and delete user
    const users = await getUsers();
    const userIndex = users.findIndex((u) => u.username === username);

    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    users.splice(userIndex, 1);
    await saveUsers(users);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
