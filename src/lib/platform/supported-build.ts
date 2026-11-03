/**
 * The Supported build: the one EZConfig build stamp the platform sends
 * configuration to (spec "Supported build and release order"). The platform
 * operator sets it without a deploy, and it is stored with when and by whom.
 * Until it is first set, nothing is sent to any game server.
 *
 * A game server whose latest poll reported any other stamp, or none, is sent
 * nothing: its polls are held like any other and answered
 * "not-supported-build" when the hold ends, and its page shows "EZConfig needs
 * updating" with both stamps. A reported build that is not the Supported build
 * is logged when it changes, never on every poll.
 */
import type { GameServer } from './game-servers';
import { log } from './log';
import { platformStore } from './storage';

export interface SupportedBuild {
  /** `YYYYMMDD-HHMMSS`. */
  stamp: string;
  setAt: number;
  /** The name of the server owner who set it; null once their account is deleted ("a former server owner"). */
  setBy: string | null;
}

export type BuildStampCheck = { ok: true; stamp: string } | { ok: false; error: string };

const STAMP = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;

/** A build stamp as the operator typed it, trimmed: `YYYYMMDD-HHMMSS`, and a real date and time. */
export function readBuildStamp(value: unknown): BuildStampCheck {
  const stamp = typeof value === 'string' ? value.trim() : '';
  const parts = STAMP.exec(stamp)?.slice(1).map(Number);
  if (!parts) return { ok: false, error: 'A build stamp is YYYYMMDD-HHMMSS, for example 20261102-153000' };
  const [year, month, day, hour, minute, second] = parts;
  const time = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const back = [time.getUTCFullYear(), time.getUTCMonth() + 1, time.getUTCDate(), time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()];
  if (back.some((part, index) => part !== parts[index])) return { ok: false, error: 'That build stamp is not a real date and time' };
  return { ok: true, stamp };
}

export function readSupportedBuild(): SupportedBuild | null {
  const row = platformStore().get<{ stamp: string; set_at: number; set_by: string | null }>(
    'SELECT supported_build.stamp, supported_build.set_at, users.username AS set_by FROM supported_build LEFT JOIN users ON users.id = supported_build.set_by',
  );
  return row ? { stamp: row.stamp, setAt: row.set_at, setBy: row.set_by } : null;
}

/** Sets the Supported build to a stamp `readBuildStamp` accepted; false when it already is that stamp, which keeps its set at and set by. */
export function setSupportedBuild(stamp: string, setBy: number, now = Date.now()): boolean {
  return platformStore().run(
    `INSERT INTO supported_build (id, stamp, set_at, set_by) VALUES (1, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET stamp = excluded.stamp, set_at = excluded.set_at, set_by = excluded.set_by WHERE stamp IS NOT excluded.stamp`,
    stamp, now, setBy,
  ) === 1;
}

/** Whether a reported build stamp (null: none) is the Supported build. Never, while none is set. */
export function isSupportedBuild(reported: string | null, supported = readSupportedBuild()?.stamp ?? null): boolean {
  return reported !== null && reported === supported;
}

/**
 * Logs a poll's build when it is not the Supported build and is not what the
 * game server reported last (or this is its first poll). Call it before the
 * poll is recorded.
 */
export function logReportedBuild(server: Pick<GameServer, 'id' | 'lastPollAt' | 'reportedBuildStamp'>, reported: string | null): void {
  const changed = server.lastPollAt === null || server.reportedBuildStamp !== reported;
  if (changed && !isSupportedBuild(reported)) log.info('poll.not-supported-build', { gameServerId: server.id, buildStamp: reported });
}
