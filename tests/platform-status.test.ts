import { describe, expect, test } from 'bun:test';
import { withPlatformDatabase } from './helpers/platform-database';

// A made-up platform operator; no real Discord account.
const SETTINGS = {
  PUBLIC_URL: 'https://ezconfig.test',
  OPERATOR_DISCORD_IDS: '80351110224678912',
};

type Line = Record<string, unknown>;
type Fixture = { scenario: string; secrets: string[] };
const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));

/** Runs one scenario of the status fixture on its own database; info lines (stdout) and warnings and errors (stderr) come back apart. */
function runScenario(name: string) {
  const result = withPlatformDatabase(run => run('tests/fixtures/platform-status.ts', { args: [name], env: SETTINGS }));
  if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const out = parse(result.stdout), err = parse(result.stderr);
  const fixture = out.find(line => 'fixture' in line)?.fixture as Fixture;
  const info = out.filter(line => !('fixture' in line)).map(line => without(line, 'time'));
  return { ...result, fixture, info, problems: err.map(line => without(line, 'time', 'stack', 'message')) };
}

/** No Game server key or name the fixture handled appears anywhere the process wrote, besides its own result line. */
function expectNoSecretsLogged({ stdout, stderr, fixture }: ReturnType<typeof runScenario>) {
  const written = stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + stderr;
  expect(fixture.secrets.length).toBeGreaterThan(0);
  for (const secret of fixture.secrets) expect(written).not.toContain(secret);
  expect(written).not.toContain('ezc_gsk_');
  expect(written).not.toContain('ezconfig_session=');
}

const info = (event: string, ids: Line = {}) => ({ level: 'info', event, ...ids });
const refused = (userId: number) => ({ level: 'warn', event: 'operator.refused', userId });

describe('the operator status page', () => {
  test('counts game servers registered, Connected now, and Connected by reported build stamp with the Supported build marked, naming none', () => {
    const result = runScenario('counts');
    const registeredBy = (userId: number, ...ids: number[]) => ids.map(gameServerId => info('game-server.registered', { userId, gameServerId }));
    expect(result.info).toEqual([
      info('supported-build.set', { userId: 1, buildStamp: '20261102-153000' }),
      ...registeredBy(2, 1, 2, 3), ...registeredBy(3, 4, 5, 6, 7),
      info('poll.not-supported-build', { gameServerId: 4, buildStamp: '20261020-090000' }),
      info('poll.not-supported-build', { gameServerId: 5 }),
      info('poll.not-supported-build', { gameServerId: 6 }),
      info('supported-build.set', { userId: 1, buildStamp: '20261020-090000' }),
    ]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });

  test('shows the release commit, running since, and the warnings and errors since start with the newest 20, scrubbed', () => {
    const result = runScenario('health');
    expect(result.problems).toEqual([
      refused(2),
      ...Array.from({ length: 22 }, (_, n) => ({ level: 'warn', event: 'fixture.warned', gameServerId: n + 1 })),
      { level: 'error', event: 'fixture.failed', userId: 1 },
      { level: 'error', event: 'fixture.failed' },
    ]);
    expectNoSecretsLogged(result);
  });

  test('reads "Backup: last confirmed 40 s ago", and warns after 5 minutes without a heartbeat, or 5 minutes after start with none', () => {
    const result = runScenario('backup');
    // Routine heartbeats are not logged: only the first since start, and one after a stale gap.
    expect(result.info).toEqual([info('backup.heartbeat.first'), info('backup.heartbeat.resumed')]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });

  test('reads the restore check from the status file beside the database: passed, failed, old, missing, and unreadable', () => {
    const result = runScenario('restore-check');
    expect(result.info).toEqual([]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });

  test('only the platform operator can open it', () => {
    const result = runScenario('access');
    expect(result.info).toEqual([]);
    expect(result.problems).toEqual([refused(2)]);
    expectNoSecretsLogged(result);
  });
});
