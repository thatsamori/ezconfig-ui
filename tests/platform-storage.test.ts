import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { runPlatformFixture } from './helpers/platform-database';

const repo = resolve(import.meta.dir, '..');
type Start = { events: string[]; blocked?: string; logged: string[] };

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ezconfig-platform-storage-'));
  try { await run(root); }
  finally {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1)?.startsWith('ezconfig-platform-storage-')) throw new Error('Unsafe fixture cleanup');
    await rm(target, { recursive: true, force: true });
  }
}
/** Starts the app once from `cwd`, the release whose migrations it carries. */
function start(root: string, cwd: string, database: string | null = join(root, 'platform.db')): Start {
  const env: Record<string, string | undefined> = {
    ...process.env, DATABASES_PATH: join(root, 'Databases'), PRESETS_PATH: join(root, 'Presets'),
    RCON_AUTO_SYNC_ENABLED: 'false', RCON_HOST: '127.0.0.1', DATABASE_PATH: database ?? undefined,
  };
  delete env.NEXT_PHASE;
  if (database === null) delete env.DATABASE_PATH;
  const result = Bun.spawnSync([process.execPath, 'run', join(repo, 'tests', 'fixtures', 'platform-startup.ts')], { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
  return JSON.parse(result.stdout.toString());
}
/** A release directory carrying exactly these migrations, as a deploy would. */
async function release(root: string, name: string, migrations: Record<string, string>) {
  const directory = join(root, name, 'src', 'lib', 'platform', 'migrations');
  await mkdir(directory, { recursive: true });
  for (const [file, sql] of Object.entries(migrations)) await writeFile(join(directory, file), sql);
  return join(root, name);
}
function inspect(path: string) {
  const database = new Database(path, { readonly: true });
  try {
    const version = (database.query('PRAGMA user_version').get() as { user_version: number }).user_version;
    const tables = (database.query("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(row => row.name);
    return { version, tables };
  } finally { database.close(); }
}

test("a fresh database gets every one of the repo's migrations before automatic sync registers, with no copy", async () => fixture(async root => {
  const latest = (await readdir(join(repo, 'src', 'lib', 'platform', 'migrations'))).filter(name => name.endsWith('.sql')).length;
  expect(start(root, repo)).toEqual({ events: [`sync after version ${latest}`], logged: [expect.stringContaining('[EZConfig platform storage]')] });
  expect(inspect(join(root, 'platform.db')).version).toBe(latest);
  expect((await readdir(root)).filter(name => name.endsWith('.bak'))).toEqual([]);
}));

const log = (path: string) => {
  const database = new Database(path, { readonly: true });
  try { return (database.query('SELECT step FROM log ORDER BY rowid').all() as { step: number }[]).map(row => row.step); }
  finally { database.close(); }
};

test('pending migrations apply in order, each in its own transaction; a failed one rolls back and blocks startup and sync until a fixed release', async () => fixture(async root => {
  const first = {
    '0001-create-log.sql': 'CREATE TABLE log (step INTEGER NOT NULL);\nINSERT INTO log VALUES (1);',
    '0002-second.sql': 'INSERT INTO log VALUES (2);',
  };
  const broken = await release(root, 'broken', { ...first, '0003-half-done.sql': 'CREATE TABLE half (id INTEGER);\nINSERT INTO log VALUES (3);\nINSERT INTO missing VALUES (1);' });
  const outcome = start(root, broken);
  expect(outcome.events).toEqual([]);
  expect(outcome.blocked).toContain('0003-half-done failed and was rolled back');
  expect(outcome.blocked).toContain('stays at version 2');
  expect(outcome.blocked).toContain('no such table: missing');
  expect(outcome.logged).toEqual([expect.stringContaining('[EZConfig platform storage] startup blocked')]);
  expect(inspect(join(root, 'platform.db'))).toEqual({ version: 2, tables: ['log'] });
  expect(log(join(root, 'platform.db'))).toEqual([1, 2]);

  const fixed = await release(root, 'fixed', { ...first, '0003-half-done.sql': 'CREATE TABLE half (id INTEGER);\nINSERT INTO log VALUES (3);', '0004-fourth.sql': 'INSERT INTO log VALUES (4);' });
  expect(start(root, fixed).events).toEqual(['sync after version 4']);
  expect(inspect(join(root, 'platform.db'))).toEqual({ version: 4, tables: ['half', 'log'] });
  expect(log(join(root, 'platform.db'))).toEqual([1, 2, 3, 4]);
}));

test('a database newer than this release is refused before anything is written, and sync never registers', async () => fixture(async root => {
  const one = { '0001-create-log.sql': 'CREATE TABLE log (step INTEGER NOT NULL);' };
  expect(start(root, await release(root, 'newer', { ...one, '0002-second.sql': 'INSERT INTO log VALUES (2);' })).events).toEqual(['sync after version 2']);
  const before = await readdir(root);
  const outcome = start(root, await release(root, 'older', one));
  expect(outcome.events).toEqual([]);
  expect(outcome.blocked).toContain('is at version 2, newer than this release (1)');
  expect(outcome.logged).toEqual([expect.stringContaining('[EZConfig platform storage] startup blocked')]);
  expect(inspect(join(root, 'platform.db'))).toEqual({ version: 2, tables: ['log'] });
  expect(log(join(root, 'platform.db'))).toEqual([2]);
  expect((await readdir(root)).filter(name => !before.includes(name))).toEqual(['older']);
}));

const DAY = 86_400_000;
const copyName = (version: number, time: number) => `platform.db.v${version}.${new Date(time).toISOString().replace(/:/g, '-')}.bak`;
const copies = async (root: string) => (await readdir(root)).filter(name => name.startsWith('platform.db.v')).sort();

test('a migrating start first writes a VACUUM INTO copy beside the database named by version, keeping the last 3 and none older than 14 days', async () => fixture(async root => {
  const migrations: Record<string, string> = { '0001-create-log.sql': 'CREATE TABLE log (step INTEGER NOT NULL);\nINSERT INTO log VALUES (1);' };
  expect(start(root, await release(root, 'r1', migrations)).events).toEqual(['sync after version 1']);
  expect(await copies(root), 'a new database has nothing to keep').toEqual([]);

  const now = Date.now(), stale = copyName(1, now - 15 * DAY), recent = copyName(1, now - DAY);
  const unrelated = ['platform.db.v1.notes.bak', 'other.db.v1.2026-11-01T00-00-00.000Z.bak'];
  for (const name of [stale, recent, ...unrelated]) await writeFile(join(root, name), 'planted');
  migrations['0002-second.sql'] = 'INSERT INTO log VALUES (2);';
  expect(start(root, await release(root, 'r2', migrations)).events).toEqual(['sync after version 2']);
  const [second] = (await copies(root)).filter(name => ![stale, recent, ...unrelated].includes(name));
  expect(second).toMatch(/^platform\.db\.v1\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.bak$/);
  expect(inspect(join(root, second))).toEqual({ version: 1, tables: ['log'] });
  expect(log(join(root, second))).toEqual([1]);
  expect(await copies(root), 'older than 14 days goes even within the last 3').toEqual([recent, second, unrelated[0]].sort());

  for (const days of [2, 3]) await writeFile(join(root, copyName(1, now - days * DAY)), 'planted');
  migrations['0003-third.sql'] = 'INSERT INTO log VALUES (3);';
  expect(start(root, await release(root, 'r3', migrations)).events).toEqual(['sync after version 3']);
  const [third] = (await copies(root)).filter(name => name.startsWith('platform.db.v2.'));
  expect(log(join(root, third))).toEqual([1, 2]);
  expect(await copies(root), 'only the last 3').toEqual([third, second, recent, unrelated[0]].sort());
  expect(await readdir(root)).toContain(unrelated[1]);
}));

test('migrations that are not numbered 0001, 0002, ... without gaps block startup before the database is opened', async () => fixture(async root => {
  const gap = await release(root, 'gap', { '0001-first.sql': 'SELECT 1;', '0003-third.sql': 'SELECT 1;' });
  const outcome = start(root, gap);
  expect(outcome.events).toEqual([]);
  expect(outcome.blocked).toContain('found 0003-third.sql at position 2');
  expect(await readdir(root)).toEqual(['gap']);
}));

test('without DATABASE_PATH, startup runs only the self-hosted work and creates no platform database', async () => fixture(async root => {
  expect(start(root, root, null)).toEqual({ events: ['sync after version none'], logged: [] });
  expect((await readdir(root)).filter(name => name.includes('.db'))).toEqual([]);
}));

test('the test helper gives each child fixture its own fresh, migrated database and removes it after', () => {
  const runs = [runPlatformFixture('tests/fixtures/platform-database-probe.ts'), runPlatformFixture('tests/fixtures/platform-database-probe.ts')];
  for (const run of runs) expect({ exitCode: run.exitCode, stderr: run.stderr }).toEqual({ exitCode: 0, stderr: '' });
  expect(runs[0].stdout).not.toBe(runs[1].stdout);
  for (const run of runs) expect(existsSync(run.stdout)).toBe(false);
});
