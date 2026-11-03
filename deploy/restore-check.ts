/**
 * The weekly restore check (online-platform#39). ezconfig-restore-check.timer
 * starts ezconfig-restore-check.service, which runs this file on Bun as the
 * app's user. provision.sh installs it as
 * /usr/local/lib/ezconfig-platform/restore-check.ts. It needs no packages and
 * imports nothing from the app, so it never depends on a release.
 *
 * It restores the latest Litestream backup into a temp folder and runs
 * `PRAGMA integrity_check` on the copy. It then compares the copy's row count
 * per table with the live database, which it opens read-only. Litestream ships
 * each change within a second or two, so a write landing during the check can
 * make the counts differ: it restores again, up to 3 times, 20 s apart, before
 * calling a difference a failure. A failed restore or integrity check is not
 * retried.
 *
 * The result goes to the status file beside the database, never into it
 * (docs/hosting.md, "The restore check's status file"). The temp folder is
 * removed whatever happens. Litestream's own output goes to the journal; the
 * status file only names the step that failed.
 *
 * Settings come from the environment, defaulting to the instance's values:
 * - DATABASE_PATH: the live database, /var/lib/ezconfig-platform/platform.db.
 * - LITESTREAM_CONFIG: the config holding the bucket and its key. The unit
 *   passes systemd's private copy of /etc/litestream.yml.
 * - LITESTREAM: the litestream binary, /usr/local/bin/litestream.
 *
 * Exits 0 when the check passed, 1 when it failed, and 2 when the status file
 * could not be written.
 */
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export type RestoreCheckOutcome = { result: 'passed' | 'failed'; reason: string };

export interface RestoreCheckOptions {
  /** The live database. It is only ever opened read-only. */
  databasePath: string;
  /** Restores the latest backup to `output`, a path that does not exist yet. Throws when it cannot. */
  restore: (output: string) => void;
  attempts?: number;
  retryWaitMs?: number;
  /** Where the temp folder goes: the service's private /tmp on the instance. */
  tempRoot?: string;
  /** Called before each retry with the tables whose counts differed. */
  onRetry?: (attempt: number, differences: string[]) => void;
}

/** The page shows at most this much of a reason (src/lib/platform/restore-check.ts). */
const REASON_MAX = 500;
const DIFFERENCES_SHOWN = 5;

type RowCounts = Map<string, number>;

const passed = (reason: string): RestoreCheckOutcome => ({ result: 'passed', reason });
const failed = (reason: string): RestoreCheckOutcome => ({ result: 'failed', reason });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Row counts of every table but SQLite's own, read in one transaction. */
function countRows(database: Database): RowCounts {
  return database.transaction(() => {
    const tables = database.query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[];
    return new Map(tables.map(({ name }) => {
      const { rows } = database.query(`SELECT count(*) AS rows FROM "${name.replaceAll('"', '""')}"`).get() as { rows: number };
      return [name, rows] as const;
    }));
  })();
}

function readLiveCounts(databasePath: string): RowCounts {
  const live = new Database(databasePath, { readonly: true });
  try {
    return countRows(live);
  } finally {
    live.close();
  }
}

function differences(restored: RowCounts, live: RowCounts): string[] {
  const tables = [...new Set([...restored.keys(), ...live.keys()])].sort();
  return tables.flatMap(table => {
    const inCopy = restored.get(table), inLive = live.get(table);
    if (inCopy === inLive) return [];
    if (inCopy === undefined) return [`${table} is missing from the backup (${inLive} live)`];
    if (inLive === undefined) return [`${table} is not in the live database (${inCopy} restored)`];
    return [`${table}: ${inCopy} restored, ${inLive} live`];
  });
}

function listDifferences(found: string[]): string {
  const more = found.length - DIFFERENCES_SHOWN;
  return found.slice(0, DIFFERENCES_SHOWN).join('; ') + (more > 0 ? `; and ${more} more` : '');
}

/** The integrity check and row counts of one restored copy; throws when the copy cannot be read. */
function inspectCopy(output: string): { problems: string[]; counts: RowCounts } {
  // Read-write without create: a missing file is an error, never a new empty database.
  const copy = new Database(output, { readwrite: true });
  try {
    const rows = copy.query('PRAGMA integrity_check').all() as Record<string, string>[];
    const messages = rows.map(row => String(Object.values(row)[0]));
    if (messages.length === 1 && messages[0] === 'ok') return { problems: [], counts: countRows(copy) };
    // One line per problem, without the "*** in database main ***" heading.
    const lines = messages.flatMap(text => text.split('\n')).map(line => line.trim()).filter(line => line && !/^\*\*\* in database \S+ \*\*\*$/.test(line));
    return { problems: lines.length ? lines : messages, counts: new Map() };
  } finally {
    copy.close();
  }
}

/**
 * Restores the latest backup and checks it against the live database. It
 * writes only inside its own temp folder, and removes that folder before it
 * returns. Writing the status file is left to the caller.
 */
export function runRestoreCheck({ databasePath, restore, attempts = 3, retryWaitMs = 20_000, tempRoot = tmpdir(), onRetry }: RestoreCheckOptions): RestoreCheckOutcome {
  if (!existsSync(databasePath)) return failed(`There is no live database at ${databasePath} to compare the backup with`);
  const folder = mkdtempSync(join(tempRoot, 'ezconfig-restore-check-'));
  try {
    let found: string[] = [];
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        onRetry?.(attempt, found);
        Bun.sleepSync(retryWaitMs);
      }
      const attemptFolder = join(folder, `attempt-${attempt}`);
      mkdirSync(attemptFolder);
      const output = join(attemptFolder, basename(databasePath));
      try {
        restore(output);
      } catch (error) {
        return failed(`Litestream could not restore the latest backup: ${messageOf(error)}`);
      }
      if (!existsSync(output)) return failed('Litestream finished without writing a restored database');

      let copy: ReturnType<typeof inspectCopy>;
      try {
        copy = inspectCopy(output);
      } catch (error) {
        return failed(`The restored copy could not be read as a database: ${messageOf(error)}`);
      }
      if (copy.problems.length) return failed(`integrity_check found problems in the restored copy: ${listDifferences(copy.problems)}`);

      let live: RowCounts;
      try {
        live = readLiveCounts(databasePath);
      } catch (error) {
        return failed(`The live database could not be read to compare with: ${messageOf(error)}`);
      }
      found = differences(copy.counts, live);
      if (!found.length) {
        const rows = [...live.values()].reduce((sum, count) => sum + count, 0);
        const tries = attempt > 1 ? ` on attempt ${attempt} of ${attempts}` : '';
        return passed(`Restored the latest backup${tries}: integrity_check ok, and all ${live.size} tables (${rows} rows) have the live database's row counts`);
      }
    }
    return failed(`Row counts still differed from the live database after ${attempts} restores: ${listDifferences(found)}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** A restore by the litestream CLI, from the replica its config names for `databasePath`. */
export function litestreamRestore(binary: string, config: string, databasePath: string, timeoutMs = 15 * 60_000) {
  return (output: string) => {
    const run = Bun.spawnSync([binary, 'restore', '-config', config, '-o', output, databasePath], { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit', timeout: timeoutMs });
    if (run.exitedDueToTimeout) throw new Error(`litestream restore took more than ${timeoutMs / 60_000} minutes`);
    if (run.exitCode !== 0) throw new Error(`litestream restore exited ${run.exitCode ?? run.signalCode} (its output is in the journal: journalctl -u ezconfig-restore-check)`);
  };
}

/** `<databasePath>.restore-check.json`, the file the operator's Status page reads. */
export const restoreCheckStatusPath = (databasePath: string) => `${databasePath}.restore-check.json`;

/**
 * Replaces the status file with this outcome: a temp file in the same folder,
 * renamed over the old one, so the app never reads half a file.
 */
export function writeRestoreCheckStatus(databasePath: string, { result, reason }: RestoreCheckOutcome, checkedAt = new Date()): string {
  const path = restoreCheckStatusPath(databasePath);
  const temp = `${path}.${process.pid}.tmp`;
  const fields = { checkedAt: checkedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'), result, reason: reason.slice(0, REASON_MAX) };
  try {
    writeFileSync(temp, `${JSON.stringify(fields)}\n`, { mode: 0o644 });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  return path;
}

/** One JSON line per event, like the app's log (src/lib/platform/log.ts). */
function log(level: 'info' | 'warn' | 'error', event: string, message: string) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, message });
  if (level === 'info') console.log(line);
  else console.error(line);
}

if (import.meta.main) {
  const databasePath = process.env.DATABASE_PATH || '/var/lib/ezconfig-platform/platform.db';
  const config = process.env.LITESTREAM_CONFIG || '/etc/litestream.yml';
  const binary = process.env.LITESTREAM || '/usr/local/bin/litestream';

  let outcome: RestoreCheckOutcome;
  try {
    outcome = runRestoreCheck({
      databasePath,
      restore: litestreamRestore(binary, config, databasePath),
      onRetry: (attempt, found) => log('warn', 'restore-check.retry', `Restoring again (attempt ${attempt}): ${listDifferences(found)}`),
    });
  } catch (error) {
    outcome = failed(`The check stopped: ${messageOf(error)}`);
  }
  try {
    writeRestoreCheckStatus(databasePath, outcome);
  } catch (error) {
    log('error', 'restore-check.unrecorded', `The status file could not be written (${messageOf(error)}); the check ${outcome.result}: ${outcome.reason}`);
    process.exit(2);
  }
  log(outcome.result === 'passed' ? 'info' : 'error', `restore-check.${outcome.result}`, outcome.reason);
  process.exit(outcome.result === 'passed' ? 0 : 1);
}
