import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { migratePlatformDatabase, PLATFORM_MIGRATIONS_DIRECTORY, readPlatformMigrations } from '../../src/lib/platform/storage';

const repo = resolve(import.meta.dir, '..', '..');
const PREFIX = 'ezconfig-platform-db-';

export interface PlatformFixtureOptions {
  args?: string[];
  /** On top of this process's env and DATABASE_PATH. */
  env?: Record<string, string>;
}
export type PlatformFixtureResult = { exitCode: number; stdout: string; stderr: string };
export type PlatformFixtureRunner = (fixture: string, options?: PlatformFixtureOptions) => PlatformFixtureResult;

/**
 * Gives `work` a fresh database with every migration applied, in its own temp
 * root, and a runner for child fixtures with DATABASE_PATH at it (several runs
 * share it, as restarts do). The env is in place before a fixture imports
 * anything. The root is removed once `work` returns.
 */
export function withPlatformDatabase<T>(work: (run: PlatformFixtureRunner, root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), PREFIX));
  try {
    const path = join(root, 'platform.db');
    migratePlatformDatabase(path, readPlatformMigrations(join(repo, PLATFORM_MIGRATIONS_DIRECTORY)));
    return work((fixture, { args = [], env = {} } = {}) => {
      const result = Bun.spawnSync([process.execPath, '--no-env-file', 'run', fixture, ...args], { cwd: repo, env: { ...process.env, DATABASE_PATH: path, ...env }, stdout: 'pipe', stderr: 'pipe' });
      return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
    }, root);
  } finally {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1)?.startsWith(PREFIX)) throw new Error('Unsafe fixture cleanup');
    rmSync(target, { recursive: true, force: true });
  }
}

/** Runs one child fixture against its own fresh database (see withPlatformDatabase). */
export function runPlatformFixture(fixture: string, options?: PlatformFixtureOptions): PlatformFixtureResult {
  return withPlatformDatabase(run => run(fixture, options));
}
