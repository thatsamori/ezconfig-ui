/**
 * Litestream's backup heartbeat (spec: Platform operator pages, Backup).
 *
 * Litestream calls `/internal/backup-heartbeat` on localhost every 75 s (its
 * 1-minute interval, checked every 15 s), but only while the database has
 * synced to the bucket within the last minute (`deploy/litestream.yml.example`). The app keeps the time of the last call in
 * process memory, so a restart forgets it. The operator page reads it and warns
 * after `BACKUP_HEARTBEAT_STALE_MS` without one, or that long after start with
 * none yet.
 *
 * Calls are routine and not logged; the first one since start, and one after a
 * stale gap, are.
 */
import { log } from './log';

export const BACKUP_HEARTBEAT_STALE_MS = 5 * 60_000;

// Shared across Next route bundles and hot reloads, like the log health; a restart clears it.
const stateKey = Symbol.for('ezconfig-ui.platform.backup-heartbeat.v1');
const shared = globalThis as typeof globalThis & { [key: symbol]: { last?: number } | undefined };
const state = shared[stateKey] ??= {};

export function recordBackupHeartbeat(now = Date.now()): void {
  const previous = state.last;
  state.last = now;
  if (previous === undefined) log.info('backup.heartbeat.first');
  else if (now - previous > BACKUP_HEARTBEAT_STALE_MS) log.info('backup.heartbeat.resumed');
}

/** The time of Litestream's last heartbeat since the process started, or null if none came yet. */
export function readLastBackupHeartbeat(): Date | null {
  return state.last === undefined ? null : new Date(state.last);
}

/**
 * Overdue: no heartbeat for more than `BACKUP_HEARTBEAT_STALE_MS`, or none
 * yet and the process started more than that long ago.
 */
export function backupHeartbeatOverdue(startedAt: number, now = Date.now()): boolean {
  return now - (state.last ?? startedAt) > BACKUP_HEARTBEAT_STALE_MS;
}
