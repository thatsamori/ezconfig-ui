/**
 * POST /api/auth/sign-out-everywhere
 *
 * Sign out everywhere: ends every session the server owner has, on every
 * device, and clears this browser's cookie.
 */

import { NextResponse } from 'next/server';
import { endedSessionCookie, requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { endAllSessions } from '@/lib/platform/sessions';

export async function POST(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    endAllSessions(session.user.id);
    log.info('sign-out.everywhere', { userId: session.user.id });
    const response = NextResponse.json({ success: true });
    response.headers.append('Set-Cookie', endedSessionCookie());
    return response;
  } catch (error) {
    log.error('sign-out.failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not sign out everywhere' }, { status: 500 });
  }
}
