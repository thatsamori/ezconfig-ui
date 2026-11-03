import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { withPlatformDatabase, type PlatformFixtureRunner } from './helpers/platform-database';

const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test', RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false' };

type Line = Record<string, unknown>;
type Fixture = { scenario: string; secrets: string[]; handover?: Record<string, unknown> };
const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));

/** Runs one scenario of the game servers fixture and splits what it wrote into log lines and its own result. */
function scenario(run: PlatformFixtureRunner, root: string, name: string, env: Record<string, string> = {}) {
  const result = run('tests/fixtures/platform-game-servers.ts', { args: [name], env: { ...SETTINGS, DATABASES_PATH: join(root, 'Databases'), ...env } });
  if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const out = parse(result.stdout), err = parse(result.stderr);
  const fixture = out.find(line => 'fixture' in line)?.fixture as Fixture;
  // stdout (info) then stderr (warnings and errors), without times.
  const log = [...out.filter(line => !('fixture' in line)), ...err].map(line => without(line, 'time'));
  return { ...result, fixture, log };
}

/** No Game server key the fixture handled appears anywhere in what the process wrote, besides its own result line. */
function expectNoKeysLogged({ stdout, stderr, fixture }: ReturnType<typeof scenario>) {
  const written = stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + stderr;
  expect(fixture.secrets.length).toBeGreaterThan(0);
  for (const key of fixture.secrets) expect(written).not.toContain(key);
  expect(written).not.toContain('ezc_gsk_');
  expect(written).not.toContain('ezconfig_session=');
}

const runScenario = (name: string) => withPlatformDatabase((run, root) => scenario(run, root, name));
const registered = (userId: number, gameServerId: number) => ({ level: 'info', event: 'game-server.registered', userId, gameServerId });

describe('registering a game server', () => {
  test('by a name unique per owner, ignoring case, with an empty Draft and a key shown once and stored only as its hash', () => {
    const result = runScenario('register');
    expect(result.log).toEqual([
      registered(1, 1), registered(1, 2), registered(1, 3), registered(2, 4),
      { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' },
    ]);
    expect(result.fixture.secrets).toHaveLength(4);
    expectNoKeysLogged(result);
  });
});

describe('the poll exchange', () => {
  test('a missing or unknown key gets 401 "key-rejected" at once, logged as one count per clock hour', () => {
    const result = runScenario('rejected');
    expect(result.log).toEqual([
      registered(1, 1),
      { level: 'info', event: 'poll.key-rejected', count: 8 },
      { level: 'info', event: 'poll.key-rejected', count: 1 },
    ]);
    expectNoKeysLogged(result);
  });

  test('a poll is held, then answered "no-change"; its report is recorded as reported; a body that breaks the contract gets 400', () => {
    const result = runScenario('hold');
    const [first, noStamp, ...refused] = result.log;
    expect(first).toEqual(registered(1, 1));
    // The one poll reporting no build stamp: not the Supported build.
    expect(noStamp).toEqual({ level: 'info', event: 'poll.not-supported-build', gameServerId: 1 });
    // Routine polls are never logged: only the 16 bad bodies, each with its reason.
    expect(refused).toHaveLength(16);
    for (const line of refused) expect(Object.keys(line).sort()).toEqual(['event', 'gameServerId', 'level', 'message']);
    expect(refused[0]).toEqual({ level: 'warn', event: 'poll.bad-request', gameServerId: 1, message: 'The body must be JSON' });
    expectNoKeysLogged(result);
  });

  test('a newer poll supersedes the held one, which is answered "superseded"; superseding is logged', () => {
    const result = runScenario('supersede');
    const { alpha } = result.fixture.handover as { alpha: number; bravo: number };
    expect(result.log).toEqual([
      registered(1, 1), registered(1, 2),
      { level: 'info', event: 'poll.superseded', gameServerId: alpha },
      { level: 'info', event: 'poll.superseded', gameServerId: alpha },
    ]);
    expectNoKeysLogged(result);
  });
});

const regenerated = (userId: number, gameServerId: number) => ({ level: 'info', event: 'game-server.key-regenerated', userId, gameServerId });
const ORIGIN_REFUSED = { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' };

describe('regenerating a key', () => {
  test('ends the old key at once: a held poll on it is answered "key-rejected", the new key is shown once, and the server is Not connected until it polls with the new key', () => {
    const result = runScenario('regenerate');
    expect(result.log).toEqual([registered(1, 1), regenerated(1, 1), regenerated(1, 1), ORIGIN_REFUSED]);
    expect(result.fixture.secrets).toHaveLength(3);
    expectNoKeysLogged(result);
  });
});

describe('deleting a game server', () => {
  test('removes its key and every row that references it, answers a held poll "key-rejected", and keeps everything else', () => {
    const result = runScenario('delete');
    expect(result.log).toEqual([
      registered(2, 1), registered(1, 2), registered(1, 3),
      { level: 'info', event: 'game-server.deleted', userId: 1, gameServerId: 3 },
      registered(1, 3),
      { level: 'info', event: 'game-server.deleted', userId: 1, gameServerId: 3 },
      registered(1, 3),
      ORIGIN_REFUSED,
    ]);
    expectNoKeysLogged(result);
  });
});

describe('the shared-key warning', () => {
  test('trips when superseded instances come back 3 times within 5 minutes, never for restarts or map changes, and clears with time or Regenerate key', () => {
    const result = runScenario('shared-key');
    const superseded = result.log.filter(line => line.event === 'poll.superseded');
    expect(superseded).toHaveLength(19);
    for (const line of superseded) expect(line).toEqual({ level: 'info', event: 'poll.superseded', gameServerId: 1 });
    const keyShared = { level: 'warn', event: 'key.shared', gameServerId: 1, message: 'More than one server is using this key' };
    expect(result.log.filter(line => line.event !== 'poll.superseded')).toEqual([registered(1, 1), regenerated(1, 1), keyShared, keyShared]);
    expectNoKeysLogged(result);
  });
});

describe('connection status', () => {
  test('Never connected, then Connected while held and for 15 s after, then Not connected with last seen', () => {
    const result = runScenario('status');
    expect(result.log).toEqual([registered(1, 1)]);
    expectNoKeysLogged(result);
  });

  test('after a restart, last seen comes from the last poll written, which an unchanged poll writes at most every 5 minutes', () => withPlatformDatabase((run, root) => {
    const before = scenario(run, root, 'before-restart');
    expect(before.log).toEqual([registered(1, 1), { level: 'info', event: 'poll.not-supported-build', gameServerId: 1, buildStamp: '20261103-090000' }]);
    expectNoKeysLogged(before);
    const after = scenario(run, root, 'after-restart', { EZ_FIXTURE_HANDOVER: JSON.stringify(before.fixture.handover) });
    expect(after.log).toEqual([]);
  }));
});
