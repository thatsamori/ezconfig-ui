/**
 * Auth middleware helpers for API routes
 */

import { validateToken } from './tokens';
import type { UserRole } from './types';

export interface AuthResult {
  authorized: boolean;
  user?: { username: string; role: UserRole };
  error?: { status: number; message: string };
}

/**
 * Check if request has valid auth token with allowed role
 *
 * @param request - The incoming request
 * @param allowedRoles - Array of roles that are authorized
 * @returns Authorization result with user info or error
 */
export function requireRole(request: Request, allowedRoles: UserRole[]): AuthResult {
  // Get token from Authorization header
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      error: { status: 401, message: 'Not authenticated' },
    };
  }

  const token = authHeader.slice(7);
  const userData = validateToken(token);

  if (!userData) {
    return {
      authorized: false,
      error: { status: 401, message: 'Invalid token' },
    };
  }

  // Check if user's role is in allowed roles
  if (!allowedRoles.includes(userData.role)) {
    return {
      authorized: false,
      error: { status: 403, message: 'Forbidden - insufficient permissions' },
    };
  }

  return {
    authorized: true,
    user: { username: userData.username, role: userData.role },
  };
}
