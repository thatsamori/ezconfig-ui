/**
 * The checks route handlers run, and the cookies sign-in sets.
 *
 * Every route handler outside sign-in starts with `requireSession(request)`,
 * before it reads anything:
 * - a request that changes data (any method but GET and HEAD) must carry an
 *   `Origin` equal to the public URL's, so another site cannot submit it;
 * - every request needs a live session cookie.
 *
 * The session token is read from the cookie and handed only to the sessions
 * module; it is never logged or returned.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { log } from './log';
import { readSession, SESSION_LIFETIME_MS } from './sessions';
import { avatarUrl, isPlatformOperator, type ServerOwner } from './users';

export const SESSION_COOKIE = 'ezconfig_session';
export const SIGN_IN_STATE_COOKIE = 'ezconfig_sign_in_state';
const SIGN_IN_PATH = '/api/auth/discord';
const SIGN_IN_STATE_LIFETIME_S = 600;

export type SessionCheck = { ok: true; user: ServerOwner; token: string } | { ok: false; response: NextResponse };

/** What the signed-in shell shows: never the Discord id itself, which is only inside the avatar URL. */
export interface SessionUser {
  name: string;
  avatarUrl: string;
  operator: boolean;
}

export const sessionUser = (user: ServerOwner): SessionUser => ({ name: user.username, avatarUrl: avatarUrl(user), operator: isPlatformOperator(user.discordId) });

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim() || undefined;
  }
  return undefined;
}

/** Equal strings, compared in constant time. */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicOrigin(): string | undefined {
  try { return new URL(env.publicUrl).origin; } catch { return undefined; }
}

const refuse = (status: number, error: string) => ({ ok: false as const, response: NextResponse.json({ success: false, error }, { status }) });

export function requireSession(request: Request): SessionCheck {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = publicOrigin();
    if (!origin || request.headers.get('origin') !== origin) {
      log.warn('request.origin-refused', 'Refused a request that changes data: its Origin is missing or is not the public URL');
      return refuse(403, 'Refused: this request did not come from the platform');
    }
  }
  const token = readCookie(request, SESSION_COOKIE);
  try {
    const user = token === undefined ? undefined : readSession(token);
    return user && token ? { ok: true, user, token } : refuse(401, 'Sign in to continue');
  } catch (error) {
    log.error('session.check-failed', error);
    return refuse(500, 'Could not check the session');
  }
}

const cookie = (name: string, value: string, maxAgeSeconds: number, path = '/') =>
  `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;

/** Renewed whenever the shell loads, so the browser keeps it about as long as the server does. */
export const sessionCookie = (token: string) => cookie(SESSION_COOKIE, token, SESSION_LIFETIME_MS / 1000);
export const endedSessionCookie = () => cookie(SESSION_COOKIE, '', 0);
/** Ties Discord's redirect back to the browser that started signing in. */
export const signInStateCookie = (state: string) => cookie(SIGN_IN_STATE_COOKIE, state, SIGN_IN_STATE_LIFETIME_S, SIGN_IN_PATH);
export const usedSignInStateCookie = () => cookie(SIGN_IN_STATE_COOKIE, '', 0, SIGN_IN_PATH);
