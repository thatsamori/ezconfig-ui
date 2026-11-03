/**
 * A platform session for tests that call the self-hosted routes directly:
 * every one of them needs a signed-in server owner (online-platform#23).
 *
 * Set DATABASE_PATH first (a child fixture puts it in its own temp root; the
 * suite runs with it at a temp file), then `signInForTest()` migrates that
 * database, records a server owner and starts a session. Requests built
 * through it carry the session cookie and come from the platform's origin.
 * The app is imported only inside, so a fixture's env is in place first.
 */
import { randomInt } from 'node:crypto';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dir, '..', '..');

export interface TestSession {
  /** The server owner's platform id and the name routes record (apply records, notes). */
  userId: number;
  name: string;
  /** `Cookie` header value. */
  cookie: string;
  /** The platform's origin, which requests that change data must send. */
  origin: string;
  /** A signed-in Request from the platform's origin; a path is resolved against the public URL. */
  request(url: string, init?: RequestInit): Request;
  /** Closes the platform database, so a fixture can remove its temp root (Windows keeps open files). */
  close(): void;
}

export async function signInForTest(name = 'Test owner'): Promise<TestSession> {
  const { env } = await import('../../src/lib/env');
  if (!env.databasePath) throw new Error('DATABASE_PATH is not set: point it at a temp file before signing in for a test');
  const { closePlatformStore, migratePlatformDatabase, PLATFORM_MIGRATIONS_DIRECTORY, readPlatformMigrations } = await import('../../src/lib/platform/storage');
  const { recordSignIn } = await import('../../src/lib/platform/users');
  const { startSession } = await import('../../src/lib/platform/sessions');
  const { SESSION_COOKIE } = await import('../../src/lib/platform/auth');
  migratePlatformDatabase(env.databasePath, readPlatformMigrations(join(repo, PLATFORM_MIGRATIONS_DIRECTORY)));
  // A made-up Discord id per call, so tests sharing one database never meet.
  const user = recordSignIn({ discordId: `9${Date.now()}${randomInt(1_000_000)}`.slice(0, 19), username: name, avatar: null }, Date.now());
  const cookie = `${SESSION_COOKIE}=${startSession(user.id)}`;
  const origin = new URL(env.publicUrl).origin;
  return {
    userId: user.id,
    name: user.username,
    cookie,
    origin,
    request(url, init = {}) {
      const headers = new Headers(init.headers);
      headers.set('Cookie', cookie);
      headers.set('Origin', origin);
      return new Request(new URL(url, env.publicUrl), { ...init, headers });
    },
    close: closePlatformStore,
  };
}
