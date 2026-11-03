/**
 * The platform operator's status page (spec: Platform operator pages): what
 * the operator would otherwise need SSH for, computed when the page loads.
 *
 * - Game servers: how many are registered and Connected now, and the Connected
 *   ones by the build stamp they reported, the Supported build marked. No game
 *   server or owner is named.
 * - Health, from process memory: the release commit, running since, and the
 *   warnings and errors logged since start with the newest 20.
 * - Backup: Litestream's last heartbeat, and the weekly restore check's
 *   status file. Each warns when it is overdue.
 *
 * Times are the server's, and the sentences are written here, so the page
 * shows ages by the server's clock, not the browser's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { backupHeartbeatOverdue, readLastBackupHeartbeat } from './backup-heartbeat';
import { countGameServers } from './game-servers';
import { readLogHealth, type LogHealthEntry } from './log';
import { readRestoreCheck, RESTORE_CHECK_STALE_MS } from './restore-check';
import { isSupportedBuild, readSupportedBuild } from './supported-build';

/** When this process started; the log health and the backup heartbeat are since then. */
export const PROCESS_STARTED_AT = Math.round(performance.timeOrigin);

export interface PlatformStatus {
  /** When the status was computed. */
  now: number;
  gameServers: {
    registered: number;
    connected: number;
    supportedBuild: string | null;
    /**
     * Connected game servers by the build stamp their latest poll reported
     * (null: none), most first. The Supported build is listed even with none
     * on it.
     */
    connectedByBuild: { buildStamp: string | null; count: number; supported: boolean }[];
  };
  health: {
    /** The full commit id; null when the app is not running from a release. */
    releaseCommit: string | null;
    startedAt: number;
    warnings: number;
    errors: number;
    /** The newest 20, newest first, already scrubbed. */
    recent: LogHealthEntry[];
  };
  backup: { lastConfirmedAt: number | null; summary: string; warning: string | null };
  restoreCheck: {
    state: 'passed' | 'failed' | 'never-checked' | 'unreadable';
    checkedAt: number | null;
    reason: string | null;
    summary: string;
    warning: string | null;
  };
}

const COMMIT = /^[0-9a-f]{40}$/;

/**
 * The commit the app runs. deploy/release.sh checks each release out at its
 * commit with a detached HEAD, and the service runs in that folder, so the
 * working directory's `.git/HEAD` holds the full commit id. Anywhere else,
 * such as a checkout on a branch, null.
 */
export function readReleaseCommit(directory = process.cwd()): string | null {
  try {
    const head = readFileSync(join(directory, '.git', 'HEAD'), 'utf8').trim();
    return COMMIT.test(head) ? head : null;
  } catch {
    return null;
  }
}

/** "40 s", "6 min", "5 h", "9 days". */
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 48 * 3600) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86_400)} days`;
}

// Most first; then newer stamps first, and no stamp last.
const byCountThenStamp = (a: { buildStamp: string | null; count: number }, b: { buildStamp: string | null; count: number }) =>
  b.count - a.count || (a.buildStamp === null ? 1 : b.buildStamp === null ? -1 : b.buildStamp.localeCompare(a.buildStamp));

function gameServers(now: number): PlatformStatus['gameServers'] {
  const { registered, connectedBuildStamps } = countGameServers(now);
  const supportedBuild = readSupportedBuild()?.stamp ?? null;
  const counts = new Map<string | null, number>(supportedBuild === null ? [] : [[supportedBuild, 0]]);
  for (const stamp of connectedBuildStamps) counts.set(stamp, (counts.get(stamp) ?? 0) + 1);
  const connectedByBuild = [...counts].map(([buildStamp, count]) => ({ buildStamp, count, supported: isSupportedBuild(buildStamp, supportedBuild) })).sort(byCountThenStamp);
  return { registered, connected: connectedBuildStamps.length, supportedBuild, connectedByBuild };
}

function backup(now: number, startedAt: number): PlatformStatus['backup'] {
  const last = readLastBackupHeartbeat()?.getTime() ?? null;
  return {
    lastConfirmedAt: last,
    summary: last === null ? `Backup: not confirmed since the app started ${elapsed(now - startedAt)} ago` : `Backup: last confirmed ${elapsed(now - last)} ago`,
    warning: backupHeartbeatOverdue(startedAt, now) ? 'Litestream has not confirmed a backup for more than 5 minutes: it may have stopped, or it cannot reach the bucket.' : null,
  };
}

function restoreCheck(now: number): PlatformStatus['restoreCheck'] {
  const check = readRestoreCheck();
  switch (check.state) {
    case 'never-checked':
      return { state: check.state, checkedAt: null, reason: null, summary: 'Restore check: never checked', warning: 'No restore check has run, so no restore from the backup has been proven.' };
    case 'unreadable':
      return { state: check.state, checkedAt: null, reason: null, summary: `Restore check: unknown (its status file cannot be read: ${check.problem})`, warning: 'The restore check\'s result is unknown: its status file cannot be read.' };
    default: {
      const age = now - check.checkedAt;
      const warning = check.state === 'failed' ? 'The last restore check failed: a restore from the backup may not work.'
        : age > RESTORE_CHECK_STALE_MS ? 'The last restore check is more than 8 days old: the weekly check may have stopped running.' : null;
      return { state: check.state, checkedAt: check.checkedAt, reason: check.reason, summary: `Restore check: ${check.state} ${elapsed(age)} ago`, warning };
    }
  }
}

export function readPlatformStatus(now = Date.now(), startedAt = PROCESS_STARTED_AT): PlatformStatus {
  const { warnings, errors, recent } = readLogHealth();
  return {
    now,
    gameServers: gameServers(now),
    health: { releaseCommit: readReleaseCommit(), startedAt, warnings, errors, recent },
    backup: backup(now, startedAt),
    restoreCheck: restoreCheck(now),
  };
}
