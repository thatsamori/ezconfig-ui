/**
 * Invites: the single-use links the platform operator makes to let one
 * Discord account in as a server owner (spec "Auth, Invites and sessions").
 * The code is 32 random bytes in base64url and only its SHA-256 hash is
 * stored; the link that carries it is shown once, when the Invite is made.
 * An Invite expires 7 days after it is made. A revoke sets the revoked time
 * and keeps the row; the daily sweep deletes an unused Invite's row 30 days
 * after it expires or is revoked.
 *
 * Never log a code or a link: a log line names an Invite by its id.
 */
import { createHash, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { platformStore } from './storage';

export const INVITE_LIFETIME_MS = 7 * 86_400_000;
export const INVITE_RETENTION_MS = 30 * 86_400_000;
/** The link starts sign-in with Discord and carries the code in this query parameter. */
export const INVITE_PARAMETER = 'invite';
const CODE = /^[\w-]{43}$/;

/** What the operator's list shows; never the code. */
export interface Invite {
  id: number;
  madeAt: number;
  expiresAt: number;
}

const codeHash = (code: string) => createHash('sha256').update(code).digest('hex');

/** A code in the shape `makeInvite` gives; anything else names no Invite. */
export const isInviteCode = (value: string | null | undefined): value is string => typeof value === 'string' && CODE.test(value);

export function inviteLink(code: string): string {
  const link = new URL('/api/auth/discord', env.publicUrl);
  link.searchParams.set(INVITE_PARAMETER, code);
  return link.toString();
}

/** Makes an Invite; the link returned holds the only copy of its code. */
export function makeInvite(madeBy: number, now = Date.now()): { invite: Invite; link: string } {
  const code = randomBytes(32).toString('base64url'), expiresAt = now + INVITE_LIFETIME_MS;
  const { id } = platformStore().get<{ id: number }>(
    'INSERT INTO invites (code_hash, made_by, made_at, expires_at) VALUES (?, ?, ?, ?) RETURNING id',
    codeHash(code), madeBy, now, expiresAt,
  )!;
  return { invite: { id, madeAt: now, expiresAt }, link: inviteLink(code) };
}

/** Unused, unexpired and unrevoked Invites, newest first. */
export function listUnusedInvites(now = Date.now()): Invite[] {
  return platformStore().all<{ id: number; made_at: number; expires_at: number }>(
    'SELECT id, made_at, expires_at FROM invites WHERE used_by IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY made_at DESC, id DESC', now,
  ).map(row => ({ id: row.id, madeAt: row.made_at, expiresAt: row.expires_at }));
}

/** Revokes an Invite the list shows; false when it shows none with that id. */
export function revokeInvite(id: number, now = Date.now()): boolean {
  return platformStore().run(
    'UPDATE invites SET revoked_at = ? WHERE id = ? AND used_by IS NULL AND revoked_at IS NULL AND expires_at > ?', now, id, now,
  ) === 1;
}

/** The Invite a code names, and whether it can still be spent (unused, unrevoked, unexpired). */
export function findInvite(code: string, now = Date.now()): { id: number; spendable: boolean } | undefined {
  const row = platformStore().get<{ id: number; used_by: number | null; revoked_at: number | null; expires_at: number }>(
    'SELECT id, used_by, revoked_at, expires_at FROM invites WHERE code_hash = ?', codeHash(code));
  return row && { id: row.id, spendable: row.used_by === null && row.revoked_at === null && row.expires_at > now };
}

/** Records who an Invite let in; sign-in calls it in the transaction that creates them. */
export function spendInvite(id: number, userId: number, now = Date.now()): void {
  const spent = platformStore().run(
    'UPDATE invites SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL AND revoked_at IS NULL AND expires_at > ?', userId, now, id, now,
  );
  if (spent !== 1) throw new Error(`Invite ${id} can no longer be spent`);
}

/** The sweep's part: an unused Invite's row goes 30 days after it expires or is revoked, whichever comes first. */
export function deleteOldInvites(now = Date.now()): number {
  return platformStore().run(
    'DELETE FROM invites WHERE used_by IS NULL AND MIN(expires_at, COALESCE(revoked_at, expires_at)) <= ?', now - INVITE_RETENTION_MS,
  );
}
