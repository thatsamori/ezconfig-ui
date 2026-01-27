/**
 * Authentication types for user management
 */

/**
 * Available user roles
 * - config_editor: Can edit configs, manage presets, but not manage users
 * - admin: Full access including user management
 */
export type UserRole = 'config_editor' | 'admin';

/**
 * User record stored in users.json
 */
export interface User {
  username: string;
  password: string;
  role: UserRole;
}

/**
 * Auth token with user info (returned to client)
 */
export interface AuthToken {
  username: string;
  role: UserRole;
  token: string;
}
