/**
 * GET /api/auth/session
 *
 * The signed-in server owner, for the shell: { user: { name, avatarUrl, operator } },
 * or 401 when this browser has no live session. Each answer renews the
 * cookie's lifetime; a dead cookie is cleared.
 */

import { NextResponse } from 'next/server';
import { endedSessionCookie, readCookie, requireSession, SESSION_COOKIE, sessionCookie, sessionUser } from '@/lib/platform/auth';

export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) {
    if (session.response.status === 401 && readCookie(request, SESSION_COOKIE)) session.response.headers.append('Set-Cookie', endedSessionCookie());
    return session.response;
  }
  const response = NextResponse.json({ user: sessionUser(session.user) }, { headers: { 'Cache-Control': 'no-store' } });
  response.headers.append('Set-Cookie', sessionCookie(session.token));
  return response;
}
