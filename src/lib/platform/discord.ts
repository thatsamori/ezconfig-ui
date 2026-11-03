/**
 * The Discord OAuth exchange: the platform's only call to Discord, and the one
 * module tests replace, so no test or script ever reaches Discord.
 *
 * It trades the code from Discord's redirect for the signed-in Discord
 * account, asking only for the `identify` scope, and drops Discord's access
 * token before it returns: nothing outside this function sees it, and nothing
 * stores it. Errors carry fixed messages and an HTTP status, never the code,
 * a token or a response body.
 */
import { env } from '@/lib/env';

/** The account as Discord's `GET /users/@me` returns it; sign-in checks every field. */
export interface DiscordUser {
  id: unknown;
  username: unknown;
  global_name?: unknown;
  avatar?: unknown;
}

const API = 'https://discord.com/api/v10';
const TIMEOUT_MS = 10_000;

export async function exchangeDiscordCode(code: string): Promise<DiscordUser> {
  const tokenResponse = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: env.discordRedirectUrl,
      client_id: env.discordClientId, client_secret: env.discordClientSecret,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!tokenResponse.ok) throw new Error(`Discord refused the sign-in code (HTTP ${tokenResponse.status})`);
  const { access_token: accessToken } = await tokenResponse.json() as { access_token?: unknown };
  if (typeof accessToken !== 'string') throw new Error('Discord answered the sign-in code without an access token');
  const userResponse = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!userResponse.ok) throw new Error(`Discord did not return the signed-in account (HTTP ${userResponse.status})`);
  return await userResponse.json() as DiscordUser;
}
