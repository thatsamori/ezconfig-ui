/**
 * GET /api/auth/discord[?invite=…]
 *
 * The "Sign in with Discord" button, and where an Invite link points. Sends
 * the browser to Discord, asking only for `identify`, with a random state that
 * the callback checks against the cookie set here. An Invite link's code goes
 * into a cookie for the callback, never to Discord; a later start without one
 * keeps it, so cancelling on Discord and signing in again still uses it.
 */

import { randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { inviteCookie, signInStateCookie } from '@/lib/platform/auth';
import { INVITE_PARAMETER, isInviteCode } from '@/lib/platform/invites';
import { log } from '@/lib/platform/log';
import { discordAuthorizeUrl } from '@/lib/platform/sign-in';

// A fresh state per request; never prerendered.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (!env.discordClientId || !env.discordClientSecret || !env.databasePath) {
    log.error('sign-in.not-configured', 'DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET or DATABASE_PATH is not set');
    headers.set('Location', '/?sign-in=failed');
    return new Response(null, { status: 303, headers });
  }
  const state = randomBytes(32).toString('base64url');
  headers.set('Location', discordAuthorizeUrl(state));
  headers.append('Set-Cookie', signInStateCookie(state));
  const invite = new URL(request.url).searchParams.get(INVITE_PARAMETER);
  if (isInviteCode(invite)) headers.append('Set-Cookie', inviteCookie(invite));
  return new Response(null, { status: 303, headers });
}
