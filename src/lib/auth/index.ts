/**
 * Auth barrel export
 */

export * from './types';
export * from './middleware';
export * from './permissions';

/**
 * Get auth header for API requests
 * Returns empty object if no token stored
 */
export function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = localStorage.getItem('ezconfig-auth');
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    const token = parsed?.state?.token;
    if (!token) return {};

    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
