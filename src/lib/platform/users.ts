/**
 * Server owners: one record per Discord account that may sign in. The id is
 * the platform's own and the one logs name; the Discord id is never logged.
 * Username and avatar are copied from Discord at every sign-in and never
 * edited here.
 */
import { env } from '@/lib/env';
import { platformStore } from './storage';

export interface ServerOwner {
  id: number;
  discordId: string;
  /** Discord's display name, or its username when it has none. */
  username: string;
  /** Discord's avatar hash, or null for Discord's default avatar. */
  avatar: string | null;
  firstSignedInAt: number;
  accessRemovedAt: number | null;
}

/** A Discord account as sign-in has checked it. */
export interface DiscordIdentity {
  discordId: string;
  username: string;
  avatar: string | null;
}

type Row = { id: number; discord_id: string; username: string; avatar: string | null; first_signed_in_at: number; access_removed_at: number | null };
const COLUMNS = 'id, discord_id, username, avatar, first_signed_in_at, access_removed_at';
const owner = (row: Row): ServerOwner => ({
  id: row.id, discordId: row.discord_id, username: row.username, avatar: row.avatar,
  firstSignedInAt: row.first_signed_in_at, accessRemovedAt: row.access_removed_at,
});

export function findServerOwner(id: number): ServerOwner | undefined {
  const row = platformStore().get<Row>(`SELECT ${COLUMNS} FROM users WHERE id = ?`, id);
  return row && owner(row);
}

export function findServerOwnerByDiscordId(discordId: string): ServerOwner | undefined {
  const row = platformStore().get<Row>(`SELECT ${COLUMNS} FROM users WHERE discord_id = ?`, discordId);
  return row && owner(row);
}

/** Named in the instance's OPERATOR_DISCORD_IDS; never stored, so removing the id makes them an ordinary server owner. */
export function isPlatformOperator(discordId: string): boolean {
  return env.operatorDiscordIds.includes(discordId);
}

/** An operator keeps access whatever the record says: Remove access is never offered against one. */
export function hasAccess(user: ServerOwner): boolean {
  return user.accessRemovedAt === null || isPlatformOperator(user.discordId);
}

/** Creates the record at a first sign-in, or copies Discord's current username and avatar onto it. */
export function recordSignIn(identity: DiscordIdentity, now: number): ServerOwner {
  return owner(platformStore().get<Row>(
    `INSERT INTO users (discord_id, username, avatar, first_signed_in_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar
     RETURNING ${COLUMNS}`,
    identity.discordId, identity.username, identity.avatar, now,
  )!);
}

/** Served from Discord's CDN, the one image host the Content-Security-Policy allows. */
export function avatarUrl(user: Pick<ServerOwner, 'discordId' | 'avatar'>): string {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=64`;
  // Discord's default avatar for accounts on unique usernames: (id >> 22) % 6.
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.discordId) >> BigInt(22)) % BigInt(6))}.png`;
}
