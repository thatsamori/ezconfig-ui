/**
 * Server-side token management
 *
 * In-memory store for active authentication tokens.
 * Note: Tokens are lost on server restart.
 */

import type { UserRole, User } from './types';

/**
 * Token data stored in memory
 */
interface TokenData {
  username: string;
  role: UserRole;
}

/**
 * In-memory store for active tokens
 */
const activeTokens = new Map<string, TokenData>();

/**
 * Store a token for a user
 */
export function storeToken(token: string, user: User): void {
  activeTokens.set(token, {
    username: user.username,
    role: user.role,
  });
}

/**
 * Validate a token and return user info if valid
 */
export function validateToken(token: string): TokenData | null {
  const data = activeTokens.get(token);
  return data || null;
}

/**
 * Remove a token (logout)
 */
export function removeToken(token: string): void {
  activeTokens.delete(token);
}
