/**
 * GET /api/auth/discord/callback?code=…&state=…
 *
 * Discord's redirect back after the person approves or cancels. Checks the
 * state against this browser's cookie, exchanges the code for the Discord
 * account, then signs it in with a new session or refuses it. Always ends on
 * the app's page: `/` when signed in, otherwise `/?sign-in=` one of
 * `invite-only`, `access-removed`, `cancelled` or `failed`.
 */

import { readCookie, sameSecret, sessionCookie, SIGN_IN_STATE_COOKIE, usedSignInStateCookie } from '@/lib/platform/auth';
import { exchangeDiscordCode } from '@/lib/platform/discord';
import { log } from '@/lib/platform/log';
import { signIn } from '@/lib/platform/sign-in';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const code = query.get('code'), state = query.get('state');
  const expected = readCookie(request, SIGN_IN_STATE_COOKIE);
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', usedSignInStateCookie());
  const back = (outcome?: string) => {
    headers.set('Location', outcome ? `/?sign-in=${outcome}` : '/');
    return new Response(null, { status: 303, headers });
  };

  if (!state || !expected || !sameSecret(state, expected)) {
    log.warn('sign-in.failed', 'Sign-in state is missing or belongs to another browser');
    return back('failed');
  }
  // Discord sends `error=access_denied` and no code when the person cancels.
  if (!code) {
    log.info('sign-in.cancelled');
    return back('cancelled');
  }
  try {
    const result = signIn(await exchangeDiscordCode(code));
    if (!result.signedIn) return back(result.refusal);
    headers.append('Set-Cookie', sessionCookie(result.token));
    return back();
  } catch (error) {
    log.error('sign-in.failed', error);
    return back('failed');
  }
}
