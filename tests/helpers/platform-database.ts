import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { migratePlatformDatabase, readPlatformMigrations } from '../../src/lib/platform/storage';

const repo = resolve(import.meta.dir, '..', '..');
const PREFIX = 'ezconfig-platform-db-';

/**
 * Runs a child fixture from the repo root with DATABASE_PATH at its own fresh
 * database, every migration applied, and removes that database once the fixture
 * exits. The env is in place before the fixture imports anything.
 */
export function runPlatformFixture(fixture: string, options: { args?: string[]; env?: Record<string, string> } = {}) {
  const root = mkdtempSync(join(tmpdir(), PREFIX));
  try {
    const path = join(root, 'platform.db');
    migratePlatformDatabase(path, readPlatformMigrations(join(repo, 'src', 'lib', 'platform', 'migrations')));
    const result = Bun.spawnSync([process.execPath, 'run', fixture, ...(options.args ?? [])], {
      cwd: repo, env: { ...process.env, ...options.env, DATABASE_PATH: path }, stdout: 'pipe', stderr: 'pipe',
    });
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  } finally {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1)?.startsWith(PREFIX)) throw new Error('Unsafe fixture cleanup');
    rmSync(target, { recursive: true, force: true });
  }
}
