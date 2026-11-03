/**
 * The platform operator's Server owners page (spec "Platform operator pages"):
 * the list of server owners, Remove access, Restore access and Delete. No
 * action is taken against a platform operator, so the operator cannot lock
 * the instance out by mistake.
 *
 * - Remove access sets the access removed time and ends every session the
 *   server owner has. Sign-in refuses them from then on, even with an Invite
 *   (sign-in.ts), so their Drafts and Live configurations cannot change. Their
 *   data stays, and their game servers are still answered: a build change
 *   still re-delivers their Live configurations.
 * - Restore access clears the time; they sign in again as before.
 * - Delete, for an erasure request, removes the server owner's record, and
 *   the foreign keys take the rest in the same statement: their sessions,
 *   game servers with Drafts and Live configurations, Rulesets with their
 *   versions, and the Invites they used. Their Notes, the Supported build if
 *   they set it, and Invites they made lose their author ("a former server
 *   owner"). Polls held on their game servers' keys are answered "key
 *   rejected".
 *
 * The list shows each server owner's name, avatar, times and how many game
 * servers they have: never a game server, Draft, Live configuration or
 * Ruleset of theirs.
 */
import { endKey } from './polls';
import { endAllSessions } from './sessions';
import { platformStore } from './storage';
import { avatarUrl, findServerOwner, isPlatformOperator, type ServerOwner } from './users';

/** A row of the operator's list. Never the Discord id itself, which is only inside the avatar URL. */
export interface ServerOwnerListing {
  id: number;
  /** Discord's display name, as copied at their last sign-in. */
  name: string;
  avatarUrl: string;
  firstSignedInAt: number;
  /** The latest last seen of their sessions, written at most once an hour; null while they have none. */
  lastSeenAt: number | null;
  gameServers: number;
  accessRemovedAt: number | null;
  /** Named in OPERATOR_DISCORD_IDS: no action is offered or taken against them. */
  operator: boolean;
}

export type ServerOwnerRefusal = 'not-found' | 'operator';
export type AccessChange = { ok: true; changed: boolean; serverOwner: ServerOwnerListing } | { ok: false; refusal: ServerOwnerRefusal };
export type Deletion = { ok: true; gameServers: number } | { ok: false; refusal: ServerOwnerRefusal | 'not-confirmed' };

type Row = {
  id: number; discord_id: string; username: string; avatar: string | null; first_signed_in_at: number; access_removed_at: number | null;
  last_seen_at: number | null; game_servers: number;
};
const SELECT = `SELECT users.id, users.discord_id, users.username, users.avatar, users.first_signed_in_at, users.access_removed_at,
  (SELECT MAX(last_seen_at) FROM sessions WHERE user_id = users.id) AS last_seen_at,
  (SELECT COUNT(*) FROM game_servers WHERE owner_id = users.id) AS game_servers
  FROM users`;
const listing = (row: Row): ServerOwnerListing => ({
  id: row.id, name: row.username, avatarUrl: avatarUrl({ discordId: row.discord_id, avatar: row.avatar }),
  firstSignedInAt: row.first_signed_in_at, lastSeenAt: row.last_seen_at, gameServers: row.game_servers,
  accessRemovedAt: row.access_removed_at, operator: isPlatformOperator(row.discord_id),
});

/** Every server owner, in the order they first signed in. */
export function listServerOwners(): ServerOwnerListing[] {
  return platformStore().all<Row>(`${SELECT} ORDER BY users.first_signed_in_at, users.id`).map(listing);
}

export function findServerOwnerListing(id: number): ServerOwnerListing | undefined {
  const row = platformStore().get<Row>(`${SELECT} WHERE users.id = ?`, id);
  return row && listing(row);
}

/** The server owner an action names, or why it is refused. */
function target(id: number): { ok: true; user: ServerOwner } | { ok: false; refusal: ServerOwnerRefusal } {
  const user = findServerOwner(id);
  if (!user) return { ok: false, refusal: 'not-found' };
  return isPlatformOperator(user.discordId) ? { ok: false, refusal: 'operator' } : { ok: true, user };
}

/** Sets the access removed time, unless it is already set, and ends every session they have. */
export function removeAccess(id: number, now = Date.now()): AccessChange {
  const store = platformStore();
  return store.transaction((): AccessChange => {
    const found = target(id);
    if (!found.ok) return found;
    const changed = store.run('UPDATE users SET access_removed_at = ? WHERE id = ? AND access_removed_at IS NULL', now, id) === 1;
    endAllSessions(id);
    return { ok: true, changed, serverOwner: findServerOwnerListing(id)! };
  });
}

/** Clears the access removed time. */
export function restoreAccess(id: number): AccessChange {
  const store = platformStore();
  return store.transaction((): AccessChange => {
    const found = target(id);
    if (!found.ok) return found;
    const changed = store.run('UPDATE users SET access_removed_at = NULL WHERE id = ? AND access_removed_at IS NOT NULL', id) === 1;
    return { ok: true, changed, serverOwner: findServerOwnerListing(id)! };
  });
}

/** The typed confirm: the server owner's name as the list shows it, ignoring spaces around it. */
const confirms = (user: ServerOwner, typed: string) => typed.trim().normalize('NFC') === user.username.trim().normalize('NFC');

/**
 * Deletes a server owner and everything that is theirs alone, once `typed` is
 * their name. Resolves to how many game servers went with them.
 */
export function deleteServerOwner(id: number, typed: string): Deletion {
  const store = platformStore();
  const deletion = store.transaction((): Deletion & { gameServerIds?: number[] } => {
    const found = target(id);
    if (!found.ok) return found;
    if (!confirms(found.user, typed)) return { ok: false, refusal: 'not-confirmed' };
    const gameServerIds = store.all<{ id: number }>('SELECT id FROM game_servers WHERE owner_id = ?', id).map(row => row.id);
    store.run('DELETE FROM users WHERE id = ?', id);
    return { ok: true, gameServers: gameServerIds.length, gameServerIds };
  });
  if (!deletion.ok) return deletion;
  // Once committed: a poll held on one of their keys is answered "key rejected".
  for (const gameServerId of deletion.gameServerIds!) endKey(gameServerId, { deleted: true });
  return { ok: true, gameServers: deletion.gameServers };
}
