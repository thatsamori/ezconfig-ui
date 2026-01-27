/**
 * User authentication service
 *
 * Manages users stored in a JSON file with optional environment-based
 * admin bootstrap for first-time setup.
 */

import { readFile, writeFile } from 'fs/promises';
import { env } from '@/lib/env';
import type { User } from './types';

/**
 * Get all users from users.json
 * Returns empty array if file doesn't exist
 */
export async function getUsers(): Promise<User[]> {
  try {
    const content = await readFile(env.usersPath, 'utf-8');
    const users = JSON.parse(content);

    if (!Array.isArray(users)) {
      console.warn('users.json is not an array, returning empty');
      return [];
    }

    return users as User[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist - return empty array
      return [];
    }
    throw error;
  }
}

/**
 * Save users array to users.json
 */
export async function saveUsers(users: User[]): Promise<void> {
  await writeFile(env.usersPath, JSON.stringify(users, null, 2), 'utf-8');
}

/**
 * Bootstrap admin user from environment variables
 *
 * If users.json is empty or missing AND ADMIN_USERNAME + ADMIN_PASSWORD
 * are set in environment, creates an admin user with global_admin role.
 */
export async function bootstrapAdmin(): Promise<void> {
  const users = await getUsers();

  // Only bootstrap if no users exist
  if (users.length > 0) {
    return;
  }

  // Check if admin credentials are configured
  const { adminUsername, adminPassword } = env;

  if (!adminUsername || !adminPassword) {
    // No admin credentials configured, skip bootstrap
    return;
  }

  // Create admin user
  const adminUser: User = {
    username: adminUsername,
    password: adminPassword,
    role: 'global_admin',
  };

  await saveUsers([adminUser]);
  console.log(`Admin user "${adminUsername}" bootstrapped from environment`);
}

/**
 * Validate user credentials
 * Returns the user if credentials match, null otherwise
 */
export async function validateCredentials(
  username: string,
  password: string
): Promise<User | null> {
  const users = await getUsers();

  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  return user || null;
}

/**
 * Generate a simple random token for session management
 */
export function generateToken(): string {
  return crypto.randomUUID();
}
