import type { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { env } from '@/lib/env';

// The only module that opens the platform database (ADR 0001): a later driver
// change is an adapter here and nowhere else.

export type PlatformMigration = { version: number; name: string; sql: string };
export type SqlValue = string | number | null;

/** What the platform's modules query through, with `?` parameters; bun:sqlite stays behind it. */
export interface PlatformStore {
  get<Row>(sql: string, ...params: SqlValue[]): Row | undefined;
  all<Row>(sql: string, ...params: SqlValue[]): Row[];
  /** Resolves to the number of rows changed. */
  run(sql: string, ...params: SqlValue[]): number;
  /** Runs `work` in one write transaction (BEGIN IMMEDIATE); a throw rolls it back. */
  transaction<Result>(work: () => Result): Result;
}
export type PlatformMigrationResult = { path: string; from: number; to: number; applied: string[]; copy: string | null };

/** Relative to the working directory, which `next start` and the tests run from. */
export const PLATFORM_MIGRATIONS_DIRECTORY = join('src', 'lib', 'platform', 'migrations');
const MIGRATION_FILE = /^(\d{4})-[a-z0-9-]+\.sql$/;

export function readPlatformMigrations(directory = resolve(PLATFORM_MIGRATIONS_DIRECTORY)): PlatformMigration[] {
  return readdirSync(directory).filter(file => file.endsWith('.sql')).sort().map((file, index) => {
    if (Number(MIGRATION_FILE.exec(file)?.[1]) !== index + 1) throw new Error(`Platform migrations in ${directory} must be named 0001-name.sql, 0002-name.sql, ... with no gaps; found ${file} at position ${index + 1}`);
    return { version: index + 1, name: file.slice(0, -'.sql'.length), sql: readFileSync(join(directory, file), 'utf8') };
  });
}

/** Every connection enforces foreign keys; WAL is what Litestream streams. */
// Loaded when a database is first opened, not on import: Next loads every route
// module under Node while it builds, and Node has no bun:sqlite.
function sqlite(): typeof import('bun:sqlite') {
  if (!process.versions.bun) throw new Error('Platform storage uses bun:sqlite; run the app on Bun (bun --bun next start)');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a synchronous, lazy load of the driver
  return require('bun:sqlite');
}

export function openPlatformDatabase(path: string): Database {
  const database = new (sqlite().Database)(path, { create: true, strict: true });
  try {
    database.exec('PRAGMA busy_timeout = 5000');
    database.exec('PRAGMA foreign_keys = ON');
    const { journal_mode: mode } = database.query('PRAGMA journal_mode = WAL').get() as { journal_mode: string };
    if (mode !== 'wal') throw new Error(`Platform database ${path} cannot use WAL mode (got ${mode}); Litestream needs it`);
    return database;
  } catch (error) { database.close(); throw error; }
}

// One connection per process, shared across Next route bundles and hot reloads.
const storeKey = Symbol.for('ezconfig-ui.platform-storage.store.v1');
const sharedStore = globalThis as typeof globalThis & { [key: symbol]: { path: string; database: Database; store: PlatformStore } | undefined };

/** The app's connection to the database at DATABASE_PATH, opened on first use; startup has already migrated it. */
export function platformStore(): PlatformStore {
  const path = env.databasePath;
  if (!path) throw new Error('DATABASE_PATH is not set: sign-in and sessions need the platform database');
  const current = sharedStore[storeKey];
  if (current?.path === path) return current.store;
  closePlatformStore();
  const database = openPlatformDatabase(path);
  const store: PlatformStore = {
    get: <Row>(sql: string, ...params: SqlValue[]) => (database.query(sql).get(...params) ?? undefined) as Row | undefined,
    all: <Row>(sql: string, ...params: SqlValue[]) => database.query(sql).all(...params) as Row[],
    run: (sql, ...params) => database.query(sql).run(...params).changes,
    transaction: work => database.transaction(work).immediate(),
  };
  sharedStore[storeKey] = { path, database, store };
  return store;
}

/** Closes the app's connection, if open, so the file can be removed (Windows keeps open files). */
export function closePlatformStore() {
  sharedStore[storeKey]?.database.close();
  sharedStore[storeKey] = undefined;
}

const userVersion = (database: Database) => (database.query('PRAGMA user_version').get() as { user_version: number }).user_version;
const COPIES_KEPT = 3, COPY_MAX_AGE_MS = 14 * 86_400_000;

/** Beside the database, named by the version it holds; keeps the last 3 copies, none older than 14 days. */
function copyBeforeMigrating(database: Database, path: string, from: number): string {
  const directory = dirname(resolve(path)), file = basename(path), now = new Date();
  const copy = join(directory, `${file}.v${from}.${now.toISOString().replaceAll(':', '-')}.bak`);
  database.query('VACUUM INTO ?').run(copy);
  readdirSync(directory)
    .flatMap(name => {
      const stamp = name.startsWith(`${file}.v`) && /^\d+\.(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}\.\d{3}Z)\.bak$/.exec(name.slice(file.length + 2));
      return stamp ? [{ name, time: Date.parse(`${stamp[1]}:${stamp[2]}:${stamp[3]}`) }] : [];
    })
    .sort((a, b) => b.time - a.time)
    .forEach((old, index) => { if (index >= COPIES_KEPT || now.getTime() - old.time > COPY_MAX_AGE_MS) rmSync(join(directory, old.name)); });
  return copy;
}

/** Startup's job: brings the database to this release's latest migration, each in its own transaction. */
export function migratePlatformDatabase(path: string, migrations = readPlatformMigrations()): PlatformMigrationResult {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const database = openPlatformDatabase(path);
  try {
    const from = userVersion(database), pending = migrations.slice(from);
    if (from > migrations.length) throw new Error(`Platform database ${path} is at version ${from}, newer than this release (${migrations.length}); refusing to run older code against it. Deploy a release that has its migrations, or restore a copy taken before migrating.`);
    const copy = pending.length ? copyBeforeMigrating(database, path, from) : null;
    // SQLite's table-rebuild procedure: foreign keys off for this connection only,
    // checked in full before each migration commits.
    database.exec('PRAGMA foreign_keys = OFF');
    for (const migration of pending) {
      try {
        database.transaction(() => {
          database.exec(migration.sql);
          const violations = database.query('PRAGMA foreign_key_check').all().length;
          if (violations) throw new Error(`it leaves ${violations} foreign key violation(s)`);
          database.exec(`PRAGMA user_version = ${migration.version}`);
        }).immediate();
      } catch (error) {
        throw new Error(`Platform migration ${migration.name} failed and was rolled back; ${path} stays at version ${userVersion(database)}${copy ? ` (copy before migrating: ${copy})` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
      }
    }
    return { path, from, to: userVersion(database), applied: pending.map(migration => migration.name), copy };
  } finally { database.close(); }
}
