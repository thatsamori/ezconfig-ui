import { describe, expect, test } from 'bun:test';
import { withPlatformDatabase } from './helpers/platform-database';

// Two made-up platform operators; no real Discord account.
const SETTINGS = {
  PUBLIC_URL: 'https://ezconfig.test',
  OPERATOR_DISCORD_IDS: '80351110224678912,53908232506183680',
};

type Line = Record<string, unknown>;
type Fixture = { scenario: string; secrets: string[] };
const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));

/** Runs one scenario of the Supported build fixture on its own database; info lines (stdout) and warnings (stderr) come back apart. */
function runScenario(name: string) {
  const result = withPlatformDatabase(run => run('tests/fixtures/platform-supported-build.ts', { args: [name], env: SETTINGS }));
  if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const out = parse(result.stdout), err = parse(result.stderr);
  const fixture = out.find(line => 'fixture' in line)?.fixture as Fixture;
  const info = out.filter(line => !('fixture' in line)).map(line => without(line, 'time'));
  return { ...result, fixture, info, problems: err.map(line => without(line, 'time', 'stack')) };
}

/** No Game server key or server owner's name appears anywhere the process wrote, besides its own result line. */
function expectNoSecretsLogged({ stdout, stderr, fixture }: ReturnType<typeof runScenario>) {
  const written = stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + stderr;
  expect(fixture.secrets.length).toBeGreaterThan(0);
  for (const secret of fixture.secrets) expect(written).not.toContain(secret);
  expect(written).not.toContain('ezc_gsk_');
  expect(written).not.toContain('ezconfig_session=');
}

const info = (event: string, ids: Line = {}) => ({ level: 'info', event, ...ids });
const outdated = (buildStamp?: string) => info('poll.not-supported-build', { gameServerId: 1, ...(buildStamp ? { buildStamp } : {}) });

describe('the Supported build', () => {
  test('while none is set, every poll is held and answered "not-supported-build", so nothing is sent', () => {
    const result = runScenario('unset');
    expect(result.info).toEqual([
      info('game-server.registered', { userId: 1, gameServerId: 1 }),
      // Logged when the reported build changes, not on every poll.
      outdated('20261102-153000'), outdated(),
      info('poll.superseded', { gameServerId: 1 }),
    ]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });

  test('a matching stamp is answered "no-change"; a different stamp or none is held and answered "not-supported-build", with EZConfig needs updating', () => {
    const result = runScenario('stamps');
    expect(result.info).toEqual([
      info('supported-build.set', { userId: 1, buildStamp: '20261102-153000' }),
      info('game-server.registered', { userId: 2, gameServerId: 1 }),
      // A different stamp, none, and text that is not a stamp (logged without it); never the Supported build itself.
      outdated('20261020-090000'), outdated(), outdated(),
      info('supported-build.set', { userId: 1, buildStamp: '20261020-090000' }),
    ]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });

  test('only the platform operator sets it; it is stored with set at and set by, and setting it is logged as an operator action', () => {
    const result = runScenario('operator');
    expect(result.info).toEqual([
      info('supported-build.set', { userId: 1, buildStamp: '20261102-153000' }),
      info('supported-build.set', { userId: 3, buildStamp: '20261020-090000' }),
    ]);
    const refused = { level: 'warn', event: 'operator.refused', userId: 2, message: 'Refused an operator request from a server owner who is not a platform operator' };
    expect(result.problems).toEqual([refused, refused, expect.objectContaining({ level: 'warn', event: 'request.origin-refused' })]);
    expectNoSecretsLogged(result);
  });
});
