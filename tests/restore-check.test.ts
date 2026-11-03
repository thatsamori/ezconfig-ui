import { describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { restoreCheckStatusPath, runRestoreCheck, writeRestoreCheckStatus, type RestoreCheckOptions } from '../deploy/restore-check';
import { readRestoreCheck } from '../src/lib/platform/restore-check';
import { openPlatformDatabase } from '../src/lib/platform/storage';
import { withPlatformDatabase } from './helpers/platform-database';

const repo = resolve(import.meta.dir, '..');

interface Live {
  root: string;
  path: string;
  /** The app's connection, held open through the check as on the instance. */
  app: Database;
  tempRoot: string;
  /** A consistent copy of the live database as it is now, as a restore would write it. */
  snapshot: (output: string) => void;
  check: (restore: RestoreCheckOptions['restore'], options?: Partial<RestoreCheckOptions>) => ReturnType<typeof runRestoreCheck>;
}

/** A migrated live database with two users and a session (made-up Discord ids), in WAL mode. */
function withLiveDatabase<T>(work: (live: Live) => T): T {
  return withPlatformDatabase((_run, root) => {
    const path = join(root, 'platform.db');
    const tempRoot = join(root, 'tmp');
    mkdirSync(tempRoot);
    const app = openPlatformDatabase(path);
    try {
      app.exec("INSERT INTO users (discord_id, username, first_signed_in_at) VALUES ('1001', 'first', 0), ('1002', 'second', 0)");
      app.exec("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES ('s1', 1, 0, 0, 0)");
      const snapshot = (output: string) => { app.query('VACUUM INTO ?').run(output); };
      const check: Live['check'] = (restore, options) => runRestoreCheck({ databasePath: path, restore, tempRoot, retryWaitMs: 0, ...options });
      return work({ root, path, app, tempRoot, snapshot, check });
    } finally {
      app.close();
    }
  });
}

/** The live database's file and WAL, byte for byte (the shared-memory index is SQLite's scratch space). */
const fingerprint = (path: string) => [path, `${path}-wal`].map(file => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'absent'));

/** A copy taken now, restored later: the backup a few writes behind. */
function staleCopy(live: Live): (output: string) => void {
  const saved = join(live.root, 'stale.db');
  live.snapshot(saved);
  return output => copyFileSync(saved, output);
}

describe('the restore check', () => {
  test('passes when the restored copy is intact and has the live row counts, and writes nothing but its temp folder, which it removes', () => {
    withLiveDatabase(live => {
      const before = fingerprint(live.path);
      const outputs: string[] = [];
      const outcome = live.check(output => { outputs.push(output); live.snapshot(output); });

      expect(outcome.result).toBe('passed');
      expect(outcome.reason).toBe('Restored the latest backup: integrity_check ok, and all 6 tables (3 rows) have the live database\'s row counts');
      expect(outputs).toHaveLength(1);
      expect(outputs[0].startsWith(live.tempRoot)).toBe(true);
      expect(existsSync(outputs[0])).toBe(false);
      expect(readdirSync(live.tempRoot)).toEqual([]);
      expect(fingerprint(live.path)).toEqual(before);
      expect(existsSync(restoreCheckStatusPath(live.path))).toBe(false);
    });
  });

  test('restores again when a write lands during the check, and passes once the counts agree', () => {
    withLiveDatabase(live => {
      const stale = staleCopy(live);
      live.app.exec("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES ('s2', 2, 0, 0, 0)");
      const retries: [number, string[]][] = [];
      let restores = 0;
      const outcome = live.check(output => (++restores === 1 ? stale(output) : live.snapshot(output)), { onRetry: (attempt, found) => retries.push([attempt, found]) });

      expect(outcome).toEqual({ result: 'passed', reason: 'Restored the latest backup on attempt 2 of 3: integrity_check ok, and all 6 tables (4 rows) have the live database\'s row counts' });
      expect(retries).toEqual([[2, ['sessions: 1 restored, 2 live']]]);
      expect(readdirSync(live.tempRoot)).toEqual([]);
    });
  });

  test('fails when the row counts still differ after 3 restores, naming each table', () => {
    withLiveDatabase(live => {
      const stale = staleCopy(live);
      live.app.exec("INSERT INTO users (discord_id, username, first_signed_in_at) VALUES ('1003', 'third', 0)");
      live.app.exec("INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES ('s2', 3, 0, 0, 0)");
      let restores = 0;
      const outcome = live.check(output => { restores++; stale(output); });

      expect(restores).toBe(3);
      expect(outcome).toEqual({ result: 'failed', reason: 'Row counts still differed from the live database after 3 restores: sessions: 1 restored, 2 live; users: 2 restored, 3 live' });
      expect(readdirSync(live.tempRoot)).toEqual([]);
    });
  });

  test('fails when a table is missing from the backup or only in it', () => {
    withLiveDatabase(live => {
      const outcome = live.check(output => {
        live.snapshot(output);
        const copy = openPlatformDatabase(output);
        copy.exec('DROP TABLE drafts; CREATE TABLE leftovers (id INTEGER PRIMARY KEY)');
        copy.close();
      });

      expect(outcome).toEqual({ result: 'failed', reason: 'Row counts still differed from the live database after 3 restores: drafts is missing from the backup (0 live); leftovers is not in the live database (0 restored)' });
    });
  });

  test('fails at once, without restoring again, when integrity_check finds problems in the restored copy', () => {
    withLiveDatabase(live => {
      let restores = 0;
      const outcome = live.check(output => {
        restores++;
        live.snapshot(output);
        // One more page than the file has trees for: the header's page count
        // (offset 28) grows by one and a blank page is appended.
        const file = readFileSync(output);
        const pageSize = file.readUInt16BE(16), pages = file.readUInt32BE(28);
        expect(file.length).toBe(pageSize * pages);
        file.writeUInt32BE(pages + 1, 28);
        writeFileSync(output, Buffer.concat([file, Buffer.alloc(pageSize)]));
      });

      expect(restores).toBe(1);
      expect(outcome.result).toBe('failed');
      expect(outcome.reason).toMatch(/^integrity_check found problems in the restored copy: Page \d+: never used$/);
      expect(readdirSync(live.tempRoot)).toEqual([]);
    });
  });

  test('fails when the restored file is not a database', () => {
    withLiveDatabase(live => {
      const outcome = live.check(output => writeFileSync(output, 'not a database, but long enough to have a header that SQLite reads and rejects'));
      expect(outcome.result).toBe('failed');
      expect(outcome.reason).toStartWith('The restored copy could not be read as a database: ');
      expect(readdirSync(live.tempRoot)).toEqual([]);
    });
  });

  test('fails when Litestream cannot restore, or finishes without writing a database', () => {
    withLiveDatabase(live => {
      expect(live.check(() => { throw new Error('litestream restore exited 1'); }))
        .toEqual({ result: 'failed', reason: 'Litestream could not restore the latest backup: litestream restore exited 1' });
      expect(live.check(() => {})).toEqual({ result: 'failed', reason: 'Litestream finished without writing a restored database' });
      expect(readdirSync(live.tempRoot)).toEqual([]);
    });
  });

  test('fails without restoring when there is no live database to compare with', () => {
    withLiveDatabase(live => {
      let restores = 0;
      const missing = join(live.root, 'missing.db');
      const outcome = runRestoreCheck({ databasePath: missing, restore: () => { restores++; }, tempRoot: live.tempRoot });
      expect(outcome).toEqual({ result: 'failed', reason: `There is no live database at ${missing} to compare the backup with` });
      expect(restores).toBe(0);
    });
  });
});

describe("the restore check's status file", () => {
  test('is replaced whole, beside the database, in the shape the Status page reads', () => {
    withLiveDatabase(live => {
      const statusPath = restoreCheckStatusPath(live.path);
      expect(statusPath).toBe(`${live.path}.restore-check.json`);

      writeRestoreCheckStatus(live.path, { result: 'failed', reason: 'Litestream could not restore the latest backup: litestream restore exited 1' }, new Date('2026-11-01T04:00:09.512Z'));
      expect(readRestoreCheck(statusPath)).toEqual({ state: 'failed', checkedAt: Date.parse('2026-11-01T04:00:09Z'), reason: 'Litestream could not restore the latest backup: litestream restore exited 1' });

      const written = writeRestoreCheckStatus(live.path, { result: 'passed', reason: 'Restored the latest backup' }, new Date('2026-11-08T04:00:12.345Z'));
      expect(written).toBe(statusPath);
      expect(readFileSync(statusPath, 'utf8')).toBe('{"checkedAt":"2026-11-08T04:00:12Z","result":"passed","reason":"Restored the latest backup"}\n');
      expect(readRestoreCheck(statusPath)).toEqual({ state: 'passed', checkedAt: Date.parse('2026-11-08T04:00:12Z'), reason: 'Restored the latest backup' });
      expect(readdirSync(live.root).filter(file => file.endsWith('.tmp'))).toEqual([]);
    });
  });

  test('keeps at most the 500 characters of a reason that the page shows', () => {
    withLiveDatabase(live => {
      writeRestoreCheckStatus(live.path, { result: 'failed', reason: 'x'.repeat(800) });
      const { reason } = JSON.parse(readFileSync(restoreCheckStatusPath(live.path), 'utf8')) as { reason: string };
      expect(reason).toHaveLength(500);
    });
  });

  test('is written by the script itself, as failed, when litestream cannot be run', () => {
    withLiveDatabase(live => {
      const env = {
        ...process.env,
        DATABASE_PATH: live.path,
        LITESTREAM: join(live.root, 'no-litestream-here'),
        LITESTREAM_CONFIG: join(live.root, 'litestream.yml'),
        TMPDIR: live.tempRoot, TEMP: live.tempRoot, TMP: live.tempRoot,
      };
      const run = Bun.spawnSync([process.execPath, '--no-env-file', '--no-install', 'deploy/restore-check.ts'], { cwd: repo, env, stdout: 'pipe', stderr: 'pipe' });

      expect(run.exitCode).toBe(1);
      const status = readRestoreCheck(restoreCheckStatusPath(live.path));
      expect(status.state).toBe('failed');
      if (status.state !== 'failed') return;
      expect(status.reason).toStartWith('Litestream could not restore the latest backup: ');
      expect(Date.now() - status.checkedAt).toBeLessThan(60_000);
      const line = JSON.parse(run.stderr.toString().trim().split('\n').at(-1)!) as Record<string, unknown>;
      expect(line).toMatchObject({ level: 'error', event: 'restore-check.failed', message: status.reason });
      expect(readdirSync(live.tempRoot)).toEqual([]);
    });
  });
});
