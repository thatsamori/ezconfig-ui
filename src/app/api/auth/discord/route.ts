/**
 * GET /api/auth/discord
 *
 * The "Sign in with Discord" button. Sends the browser to Discord, asking only
 * for `identify`, with a random state that the callback checks against the
 * cookie set here.
 */

import { randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { signInStateCookie } from '@/lib/platform/auth';
import { log } from '@/lib/platform/log';
import { discordAuthorizeUrl } from '@/lib/platform/sign-in';

// A fresh state per request; never prerendered.
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (!env.discordClientId || !env.discordClientSecret || !env.databasePath) {
    log.error('sign-in.not-configured', 'DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET or DATABASE_PATH is not set');
    headers.set('Location', '/?sign-in=failed');
    return new Response(null, { status: 303, headers });
  }
  const state = randomBytes(32).toString('base64url');
  headers.set('Location', discordAuthorizeUrl(state));
  headers.append('Set-Cookie', signInStateCookie(state));
  return new Response(null, { status: 303, headers });
}
