import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { withPlatformDatabase } from './helpers/platform-database';

const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test', RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false' };

type Line = Record<string, unknown>;

/** Runs one scenario of tests/fixtures/platform-apply.ts, which asserts as it goes; returns the Live configuration ids it applied and what it logged, without times. */
function scenario(name: string) {
  return withPlatformDatabase((run, root) => {
    const result = run('tests/fixtures/platform-apply.ts', { args: [name], env: { ...SETTINGS, DATABASES_PATH: join(root, 'Databases') } });
    if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
    const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
    const out = parse(result.stdout), err = parse(result.stderr);
    const { applied } = out.find(line => 'fixture' in line)!.fixture as { applied: string[] };
    // stdout (info) then stderr (warnings and errors).
    const log = [...out.filter(line => !('fixture' in line)), ...err].map(line => Object.fromEntries(Object.entries(line).filter(([field]) => field !== 'time')));
    return { applied, log };
  });
}

const REGISTERED = { level: 'info', event: 'game-server.registered', userId: 1, gameServerId: 1 };
const ORIGIN_REFUSED = { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' };
const notSupported = (buildStamp: string) => ({ level: 'info', event: 'poll.not-supported-build', gameServerId: 1, buildStamp });
/** Apply and each delivery are logged by id, with no values. */
const applied = (liveConfigurationId: string) => ({ level: 'info', event: 'live-configuration.applied', userId: 1, gameServerId: 1, liveConfigurationId });
const delivered = (liveConfigurationId: string) => ({ level: 'info', event: 'live-configuration.delivered', gameServerId: 1, liveConfigurationId });
/** Each new reported result, once; a reported id only in the form the platform makes. */
const reported = (liveConfigurationId?: string) => ({ level: 'info', event: 'live-configuration.processed', gameServerId: 1, ...liveConfigurationId && { liveConfigurationId } });

describe('Apply through its route handlers', () => {
  test('the review lists the keys added, changed and reset to game default against the Live configuration; before the first Apply, every value the Draft sets', () => {
    const result = scenario('review');
    expect(result.applied).toHaveLength(1);
    expect(result.log).toEqual([REGISTERED, applied(result.applied[0]), delivered(result.applied[0])]);
  });

  test('is disabled, saying why, unless the game server is Connected and on the Supported build, checked again when the request arrives', () => {
    const result = scenario('blocked');
    expect(result.log).toEqual([
      REGISTERED, notSupported('20261101-090000'), notSupported('20261102-153000'),
      applied(result.applied[0]), delivered(result.applied[0]),
    ]);
  });

  test('is refused, with the review as it is now, when the Draft revision or the Live configuration id it was built from has moved on', () => {
    const result = scenario('stale');
    expect(result.log).toEqual([REGISTERED, applied(result.applied[0]), delivered(result.applied[0]), reported(result.applied[0])]);
  });

  test('validates the whole Draft against the current schema and blocks with the values to fix', () => {
    const result = scenario('validation');
    expect(result.log).toEqual([REGISTERED, applied(result.applied[0]), delivered(result.applied[0])]);
  });
});

describe('delivery in the poll exchange', () => {
  test('Apply replaces the Live configuration under a new id and wakes the held poll at once; a poll reporting another id, an unknown one or none gets it at once', () => {
    const result = scenario('delivery');
    const [first, second] = result.applied;
    expect(result.applied).toHaveLength(2);
    expect(result.log).toEqual([
      REGISTERED,
      applied(first), delivered(first), reported(first),
      applied(second), delivered(second),
      delivered(second), reported(), delivered(second), delivered(second),
      reported(second), { level: 'info', event: 'poll.superseded', gameServerId: 1 }, delivered(second),
      notSupported('20261101-090000'), reported(second),
      { level: 'info', event: 'game-server.deleted', userId: 1, gameServerId: 1 },
    ]);
  });

  test('a game server with no Live configuration keeps getting "no change", so its first poll never wipes it', () => {
    expect(scenario('no-wipe').log).toEqual([REGISTERED, reported('0b5e8f8e-4a4c-4c39-9a51-5c3f2b0e7d11'), reported()]);
  });
});

describe('Discard changes', () => {
  test('resets the Draft to the Live configuration, with the revision checked', () => {
    const result = scenario('discard');
    expect(result.log).toEqual([REGISTERED, applied(result.applied[0]), delivered(result.applied[0])]);
  });
});

test("Apply, its review and Discard read another owner's game server as missing, and need a session and the platform's origin", () => {
  expect(scenario('ownership').log).toEqual([REGISTERED, ORIGIN_REFUSED, ORIGIN_REFUSED]);
});
