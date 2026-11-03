/**
 * POST /api/auth/sign-out
 *
 * Sign out: ends this browser's session and clears its cookie. The server
 * owner's other sessions stay signed in.
 */

import { NextResponse } from 'next/server';
import { endedSessionCookie, requireSession } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { endSession } from '@/lib/platform/sessions';

export async function POST(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    endSession(session.token);
    log.info('sign-out', { userId: session.user.id });
    const response = NextResponse.json({ success: true });
    response.headers.append('Set-Cookie', endedSessionCookie());
    return response;
  } catch (error) {
    log.error('sign-out.failed', error, { userId: session.user.id });
    return NextResponse.json({ success: false, error: 'Could not sign out' }, { status: 500 });
  }
}
