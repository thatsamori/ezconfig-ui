/**
 * Authentication types for user management
 */

/**
 * Available user roles with increasing privilege levels
 * - viewer: Can view configs but not modify
 * - preset_creator: Can create/manage user presets
 * - config_editor: Can edit and save configs
 * - global_admin: Full access including user management
 */
export type UserRole = 'viewer' | 'preset_creator' | 'config_editor' | 'global_admin';

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
