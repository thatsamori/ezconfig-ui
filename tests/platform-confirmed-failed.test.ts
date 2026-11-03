import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { withPlatformDatabase } from './helpers/platform-database';
import { migratePlatformDatabase, PLATFORM_MIGRATIONS_DIRECTORY, readPlatformMigrations } from '../src/lib/platform/storage';

const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test' };

type Line = Record<string, unknown>;

/** Runs one scenario of tests/fixtures/platform-confirmed-failed.ts, which asserts as it goes; returns the Live configuration ids it applied, what it logged without times, and all it wrote. */
function scenario(name: string) {
  return withPlatformDatabase(run => {
    const result = run('tests/fixtures/platform-confirmed-failed.ts', { args: [name], env: SETTINGS });
    if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
    const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
    const out = parse(result.stdout), err = parse(result.stderr);
    const { applied } = out.find(line => 'fixture' in line)!.fixture as { applied: string[] };
    // stdout (info) then stderr (warnings and errors).
    const log = [...out.filter(line => !('fixture' in line)), ...err].map(line => Object.fromEntries(Object.entries(line).filter(([field]) => field !== 'time')));
    return { applied, log, written: result.stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + result.stderr };
  });
}

const REGISTERED = { level: 'info', event: 'game-server.registered', userId: 1, gameServerId: 1 };
const applied = (liveConfigurationId: string) => ({ level: 'info', event: 'live-configuration.applied', userId: 1, gameServerId: 1, liveConfigurationId });
const delivered = (liveConfigurationId: string) => ({ level: 'info', event: 'live-configuration.delivered', gameServerId: 1, liveConfigurationId });
/** Each reported result, once: by ids, and the reported id only in the form the platform makes. */
const processed = (liveConfigurationId?: string) => ({ level: 'info', event: 'live-configuration.processed', gameServerId: 1, ...liveConfigurationId && { liveConfigurationId } });
const keysIgnored = (liveConfigurationId: string, message: string) => ({ level: 'warn', event: 'live-configuration.keys-ignored', gameServerId: 1, liveConfigurationId, message });
const failed = (liveConfigurationId: string) => ({ level: 'warn', event: 'live-configuration.failed', gameServerId: 1, liveConfigurationId, message: 'The game server reports that processing stopped at a failed command' });

/** No mod error, key name or category from a report is logged. */
function expectNothingReportedLogged(written: string) {
  for (const reported of ['COULD NOT PARSE', 'The wipe failed', 'RetiredKey', 'FutureKey', 'Windup', 'Strike', 'not-a-real-id']) expect(written).not.toContain(reported);
}

describe('the Live configuration state, computed from the last report', () => {
  test('Confirmed when the game server reports processing the current Live configuration successfully, as of that report, with any ignored keys named', () => {
    const result = scenario('confirmed');
    const [first, second] = result.applied;
    expect(result.log).toEqual([
      REGISTERED, applied(first), delivered(first), processed(first), applied(second), delivered(second),
      keysIgnored(second, "The game server's build ignored 2 keys it does not know"),
    ]);
    expectNothingReportedLogged(result.written);
  });

  test('Failed when processing the current Live configuration stopped at a failed command, with where and why; never resent on its own, and recovered by a no-change Apply', () => {
    const result = scenario('failed');
    const [first, again] = result.applied;
    expect(result.log).toEqual([
      REGISTERED, applied(first), delivered(first), delivered(first), applied(again), delivered(again), processed(again),
      failed(first), failed(first),
    ]);
    expectNothingReportedLogged(result.written);
  });

  test('Pending for anything else: before a report, an id the platform does not know, or an earlier Apply\'s id', () => {
    const result = scenario('pending');
    const [first, next] = result.applied;
    expect(result.log).toEqual([
      REGISTERED, applied(first), delivered(first),
      processed('0b5e8f8e-4a4c-4c39-9a51-5c3f2b0e7d11'), delivered(first), processed(), delivered(first),
      processed(first), applied(next), delivered(next), delivered(next), delivered(next),
      failed(first),
    ]);
    expectNothingReportedLogged(result.written);
  });
});

test('a report of no id gets the whole Live configuration again, as after a build change; the current id gets nothing, as after a restart or map change', () => {
  const result = scenario('redelivery');
  const [first] = result.applied;
  expect(result.log).toEqual([REGISTERED, applied(first), delivered(first), processed(first), delivered(first), processed(first)]);
});

test('a report recorded before reports were timed is timed from its last poll written', () => {
  const root = mkdtempSync(join(tmpdir(), 'ezconfig-reported-at-'));
  try {
    const path = join(root, 'platform.db');
    const migrations = readPlatformMigrations(resolve(import.meta.dir, '..', PLATFORM_MIGRATIONS_DIRECTORY));
    const timed = migrations.findIndex(migration => migration.name.includes('reported-processed-at'));
    expect(timed).toBeGreaterThan(0);
    migratePlatformDatabase(path, migrations.slice(0, timed));
    const before = new Database(path);
    before.run("INSERT INTO users (id, discord_id, username, first_signed_in_at) VALUES (1, '1', 'Owner', 0)");
    before.run(`INSERT INTO game_servers (id, owner_id, name, name_key, key_hash, key_last4, registered_at, last_poll_at, reported_live_configuration_id, reported_result)
      VALUES (1, 1, 'A', 'a', 'h1', 'abcd', 0, 5000, 'id', '{}'), (2, 1, 'B', 'b', 'h2', 'efgh', 0, 6000, NULL, NULL), (3, 1, 'C', 'c', 'h3', 'ijkl', 0, NULL, NULL, NULL)`);
    before.close();
    migratePlatformDatabase(path, migrations);
    const after = new Database(path);
    expect(after.query('SELECT id, reported_processed_at FROM game_servers ORDER BY id').all()).toEqual([
      { id: 1, reported_processed_at: 5000 }, { id: 2, reported_processed_at: null }, { id: 3, reported_processed_at: null },
    ]);
    after.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
