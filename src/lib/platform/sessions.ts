/**
 * Server-side sessions behind the session cookie. The cookie holds a random
 * token and only its SHA-256 hash is stored, so a leaked database or backup
 * holds no usable session. A session ends 30 days after its last use; last
 * seen, and the expiry with it, is written at most once an hour, so most
 * requests only read. Sessions live in the platform database and survive
 * restarts and deploys.
 */
import { createHash, randomBytes } from 'node:crypto';
import { platformStore } from './storage';
import { findServerOwner, hasAccess, type ServerOwner } from './users';

export const SESSION_LIFETIME_MS = 30 * 86_400_000;
const LAST_SEEN_INTERVAL_MS = 3_600_000;

const sessionId = (token: string) => createHash('sha256').update(token).digest('hex');

/** Starts a session for a server owner; the token returned goes in the cookie and nowhere else. */
export function startSession(userId: number, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url'), store = platformStore();
  // Expired sessions are never read again; each sign-in clears them out.
  store.run('DELETE FROM sessions WHERE expires_at <= ?', now);
  store.run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    sessionId(token), userId, now, now + SESSION_LIFETIME_MS, now,
  );
  return token;
}

/** The server owner a token signs in, or undefined once the session ended or expired, or its owner lost access. */
export function readSession(token: string, now = Date.now()): ServerOwner | undefined {
  const store = platformStore(), id = sessionId(token);
  const session = store.get<{ user_id: number; expires_at: number; last_seen_at: number }>(
    'SELECT user_id, expires_at, last_seen_at FROM sessions WHERE id = ?', id);
  if (!session || session.expires_at <= now) return undefined;
  const user = findServerOwner(session.user_id);
  if (!user || !hasAccess(user)) return undefined;
  if (now - session.last_seen_at >= LAST_SEEN_INTERVAL_MS) {
    store.run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', now, now + SESSION_LIFETIME_MS, id);
  }
  return user;
}

/** Sign out: ends this session only. */
export function endSession(token: string): void {
  platformStore().run('DELETE FROM sessions WHERE id = ?', sessionId(token));
}

/** Sign out everywhere: ends every session the server owner has. */
export function endAllSessions(userId: number): void {
  platformStore().run('DELETE FROM sessions WHERE user_id = ?', userId);
}
