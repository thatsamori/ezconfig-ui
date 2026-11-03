import { expect, test } from 'bun:test';
import { withPlatformDatabase, type PlatformFixtureRunner } from './helpers/platform-database';

const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test' };

type Line = Record<string, unknown>;

/** Runs one scenario of tests/fixtures/platform-blocked.ts, which asserts as it goes; returns its fixture line, what it logged without times, and all it wrote. */
function scenario(run: PlatformFixtureRunner, args: string[]) {
  const result = run('tests/fixtures/platform-blocked.ts', { args, env: SETTINGS });
  if (result.exitCode !== 0) throw new Error(`${args[0]} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const out = parse(result.stdout), err = parse(result.stderr);
  const fixture = out.find(line => 'fixture' in line)!.fixture as { applied: string[]; key?: string };
  // stdout (info) then stderr (warnings and errors).
  const log = [...out.filter(line => !('fixture' in line)), ...err].map(line => Object.fromEntries(Object.entries(line).filter(([field]) => field !== 'time')));
  return { ...fixture, log, written: result.stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + result.stderr };
}

const REGISTERED = { level: 'info', event: 'game-server.registered', userId: 1, gameServerId: 1 };
const applied = (liveConfigurationId: string) => ({ level: 'info', event: 'live-configuration.applied', userId: 1, gameServerId: 1, liveConfigurationId });
const delivered = (liveConfigurationId: string) => ({ level: 'info', event: 'live-configuration.delivered', gameServerId: 1, liveConfigurationId });
const processed = (liveConfigurationId: string) => ({ level: 'info', event: 'live-configuration.processed', gameServerId: 1, liveConfigurationId });
const blocked = (liveConfigurationId: string) => ({
  level: 'warn', event: 'live-configuration.blocked', gameServerId: 1, liveConfigurationId,
  message: 'The current schema refuses values in the Live configuration, so it cannot be sent',
});

test('a Live configuration the current schema refuses is Blocked: held and never sent, named on the page, logged once per start, and recovered by an Apply of the fixed Draft', () => {
  withPlatformDatabase(run => {
    const first = scenario(run, ['blocked']);
    const [live, next] = first.applied;
    expect(first.log).toEqual([
      REGISTERED, applied(live), delivered(live), processed(live), applied(next), delivered(next), processed(next),
      blocked(live), blocked(next),
    ]);
    // A restart logs the same Blocked Live configuration once more, then not again.
    const restarted = scenario(run, ['restarted', first.key!]);
    expect(restarted.log).toEqual([blocked(next)]);
    // By ids only, and never as a failed poll.
    for (const written of [first.written, restarted.written]) {
      for (const named of ['CustomFOVMax', 'FreeStunDuration', 'RetiredKey', 'whole number', 'poll.failed']) expect(written).not.toContain(named);
    }
  });
});
