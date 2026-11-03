/**
 * Who may sign in with Discord (spec "Auth, Invites and sessions"):
 * - a server owner whose access has not been removed;
 * - a Discord id in OPERATOR_DISCORD_IDS, whose first sign-in creates the record.
 * Anyone else is refused as "invite-only": nothing about them is stored, and
 * the log line names no Discord id. Invites add the third way in (#25).
 */
import { env } from '@/lib/env';
import type { DiscordUser } from './discord';
import { log } from './log';
import { startSession } from './sessions';
import { platformStore } from './storage';
import { findServerOwnerByDiscordId, hasAccess, isPlatformOperator, recordSignIn, type DiscordIdentity, type ServerOwner } from './users';

export type SignInRefusal = 'invite-only' | 'access-removed';
export type SignInResult = { signedIn: true; user: ServerOwner; token: string } | { signedIn: false; refusal: SignInRefusal };

/** Where the sign-in button sends the browser; Discord sends it back to the redirect URL with a code and this state. */
export function discordAuthorizeUrl(state: string): string {
  const query = new URLSearchParams({ response_type: 'code', client_id: env.discordClientId, scope: 'identify', redirect_uri: env.discordRedirectUrl, state });
  return `https://discord.com/oauth2/authorize?${query}`;
}

const DISCORD_ID = /^\d{1,20}$/;
const AVATAR_HASH = /^(a_)?[0-9a-f]{32}$/;
const NAME_LIMIT = 100;

/** Checks the account Discord returned field by field; the avatar hash becomes part of a URL. */
export function discordIdentity(account: DiscordUser): DiscordIdentity {
  const { id, username, global_name: displayName, avatar } = account;
  if (typeof id !== 'string' || !DISCORD_ID.test(id)) throw new Error('Discord returned an account without a valid id');
  const name = [displayName, username].find(value => typeof value === 'string' && value.trim()) as string | undefined;
  if (!name) throw new Error('Discord returned an account without a username');
  return { discordId: id, username: name.trim().slice(0, NAME_LIMIT), avatar: typeof avatar === 'string' && AVATAR_HASH.test(avatar) ? avatar : null };
}

export function signIn(account: DiscordUser, now = Date.now()): SignInResult {
  const identity = discordIdentity(account);
  if (!isPlatformOperator(identity.discordId)) {
    const existing = findServerOwnerByDiscordId(identity.discordId);
    if (!existing) {
      log.info('sign-in.invite-only');
      return { signedIn: false, refusal: 'invite-only' };
    }
    if (!hasAccess(existing)) {
      log.info('sign-in.access-removed', { userId: existing.id });
      return { signedIn: false, refusal: 'access-removed' };
    }
  }
  const { user, token } = platformStore().transaction(() => {
    const user = recordSignIn(identity, now);
    return { user, token: startSession(user.id, now) };
  });
  log.info('sign-in', { userId: user.id });
  return { signedIn: true, user, token };
}
