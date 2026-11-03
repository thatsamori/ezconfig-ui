/**
 * The weekly restore check's result (spec: Platform operator pages, Backup),
 * read from a status file beside the database, never from the database
 * itself: `<DATABASE_PATH>.restore-check.json`, so on the instance
 * `/var/lib/ezconfig-platform/platform.db.restore-check.json`.
 *
 * The check (online-platform#39) replaces the whole file after each run, by
 * writing a temp file in the same folder and renaming it over this one, so the
 * app never reads half a file. The app's user must be able to read it. It is
 * one JSON object (docs/hosting.md, "The restore check's status file"):
 *
 *   {"checkedAt":"2026-11-08T04:00:12Z","result":"passed","reason":"…"}
 *
 * - `checkedAt`: when the check finished, ISO 8601 with `Z` or an offset.
 * - `result`: "passed" or "failed".
 * - `reason`: optional text shown on the operator's page: why it failed, or a
 *   note on a pass. At most 500 characters are shown. Never a secret.
 *
 * Any other field is ignored. A missing file reads as never checked; a file
 * that is not this shape reads as unreadable, and the page says so.
 */
import { readFileSync } from 'node:fs';
import { env } from '@/lib/env';

/** The page warns when the last check is older than this, or failed. */
export const RESTORE_CHECK_STALE_MS = 8 * 86_400_000;
export const RESTORE_CHECK_REASON_MAX = 500;

export type RestoreCheck =
  | { state: 'never-checked' }
  | { state: 'unreadable'; problem: string }
  | { state: 'passed' | 'failed'; checkedAt: number; reason: string | null };

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** The status file beside a database file; null when there is no database. */
export function restoreCheckPath(databasePath = env.databasePath): string | null {
  return databasePath ? `${databasePath}.restore-check.json` : null;
}

export function readRestoreCheck(path = restoreCheckPath()): RestoreCheck {
  if (path === null) return { state: 'never-checked' };
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? { state: 'never-checked' } : { state: 'unreadable', problem: `the file could not be read (${code ?? 'unknown error'})` };
  }
  let fields: unknown;
  try { fields = JSON.parse(text); } catch { return { state: 'unreadable', problem: 'it is not JSON' }; }
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return { state: 'unreadable', problem: 'it is not a JSON object' };
  const { checkedAt, result, reason } = fields as Record<string, unknown>;
  const time = typeof checkedAt === 'string' && ISO_TIME.test(checkedAt) ? Date.parse(checkedAt) : NaN;
  if (!Number.isFinite(time)) return { state: 'unreadable', problem: 'its checkedAt is not an ISO 8601 time' };
  if (result !== 'passed' && result !== 'failed') return { state: 'unreadable', problem: 'its result is not "passed" or "failed"' };
  if (reason !== undefined && reason !== null && typeof reason !== 'string') return { state: 'unreadable', problem: 'its reason is not text' };
  const shown = typeof reason === 'string' ? reason.trim().slice(0, RESTORE_CHECK_REASON_MAX) : '';
  return { state: result, checkedAt: time, reason: shown || null };
}
