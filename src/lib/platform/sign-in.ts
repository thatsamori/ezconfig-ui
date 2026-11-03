/**
 * Who may sign in with Discord (spec "Auth, Invites and sessions"):
 * - a server owner whose access has not been removed;
 * - a Discord id in OPERATOR_DISCORD_IDS, whose first sign-in creates the record;
 * - an account with no record that brings an Invite that is unused, unrevoked
 *   and unexpired: the record is created and the Invite spent together.
 * Anyone else is refused as "invite-only": nothing about them is stored, and
 * the log line names no Discord id. A server owner or operator who brings an
 * Invite is just signed in, and the Invite stays unused; one whose access was
 * removed is refused even with one.
 */
import { env } from '@/lib/env';
import type { DiscordUser } from './discord';
import { findInvite, spendInvite } from './invites';
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

type Decision =
  | { signedIn: true; user: ServerOwner; token: string; inviteId?: number }
  | { signedIn: false; refusal: 'invite-only'; inviteId?: number }
  | { signedIn: false; refusal: 'access-removed'; userId: number };

/** `invite` is the code the Invite link carried, if this browser came through one. */
export function signIn(account: DiscordUser, invite?: string, now = Date.now()): SignInResult {
  const identity = discordIdentity(account);
  // One write transaction, so two sign-ins through one Invite cannot both spend it.
  const decision = platformStore().transaction((): Decision => {
    let spent: number | undefined;
    if (!isPlatformOperator(identity.discordId)) {
      const existing = findServerOwnerByDiscordId(identity.discordId);
      if (existing && !hasAccess(existing)) return { signedIn: false, refusal: 'access-removed', userId: existing.id };
      if (!existing) {
        const found = invite === undefined ? undefined : findInvite(invite, now);
        if (!found?.spendable) return { signedIn: false, refusal: 'invite-only', inviteId: found?.id };
        spent = found.id;
      }
    }
    const user = recordSignIn(identity, now);
    if (spent !== undefined) spendInvite(spent, user.id, now);
    return { signedIn: true, user, token: startSession(user.id, now), inviteId: spent };
  });
  if (!decision.signedIn) {
    if (decision.refusal === 'access-removed') log.info('sign-in.access-removed', { userId: decision.userId });
    // The Invite's id when the code named a spent, revoked or expired one; the log drops it when undefined.
    else log.info('sign-in.invite-only', { inviteId: decision.inviteId });
    return { signedIn: false, refusal: decision.refusal };
  }
  const { user, token, inviteId } = decision;
  log.info('sign-in', { userId: user.id, inviteId });
  return { signedIn: true, user, token };
}
