import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { withPlatformDatabase, type PlatformFixtureRunner } from './helpers/platform-database';

// The instance settings sign-in reads (.env.example); no real Discord application.
const SETTINGS = {
  PUBLIC_URL: 'https://ezconfig.test',
  DISCORD_CLIENT_ID: '1300000000000000000',
  DISCORD_CLIENT_SECRET: 'fixture-client-secret',
  DISCORD_REDIRECT_URL: '',
  OPERATOR_DISCORD_IDS: '11111111111111111, 80351110224678912',
  RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false',
};

type Line = Record<string, unknown>;
type Fixture = { scenario: string; secrets: string[]; token?: string };
const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));

/** Runs one scenario of the sign-in fixture and splits what it wrote into log lines and its own result. */
function scenario(run: PlatformFixtureRunner, root: string, name: string, env: Record<string, string> = {}) {
  const result = run('tests/fixtures/platform-sign-in.ts', { args: [name], env: { ...SETTINGS, DATABASES_PATH: join(root, 'Databases'), ...env } });
  if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const out = parse(result.stdout), err = parse(result.stderr);
  const fixture = out.find(line => 'fixture' in line)?.fixture as Fixture;
  // stdout (info) then stderr (warnings and errors): each in order, not interleaved.
  const log = [...out.filter(line => !('fixture' in line)), ...err];
  return { ...result, fixture, log, events: log.map(line => line.event) };
}

/** Nothing the fixture handled as a secret appears anywhere in what the process wrote, besides its own result line. */
function expectNoSecretsLogged({ stdout, stderr, fixture }: ReturnType<typeof scenario>) {
  const written = stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + stderr;
  expect(fixture.secrets.length).toBeGreaterThan(0);
  for (const secret of fixture.secrets) expect(written).not.toContain(secret);
  expect(written).not.toContain('ezconfig_session=');
  expect(written).not.toContain(SETTINGS.DISCORD_CLIENT_SECRET);
}

const runScenario = (name: string, env?: Record<string, string>) => withPlatformDatabase((run, root) => scenario(run, root, name, env));

describe('sign in with Discord', () => {
  test('a platform operator signs in without an Invite; the first sign-in creates the record and later ones copy name and avatar', () => {
    const result = runScenario('operator');
    for (const line of result.log) expect(Date.parse(line.time as string)).toBeGreaterThan(0);
    expect(result.log.map(line => without(line, 'time'))).toEqual([
      { level: 'info', event: 'sign-in', userId: 1 },
      { level: 'info', event: 'sign-in', userId: 1 },
    ]);
    expectNoSecretsLogged(result);
  });

  test('anyone else is refused as invite-only, nothing about them is stored, and the log line names no Discord id', () => {
    const result = runScenario('invite-only');
    expect(result.log.map(line => without(line, 'time'))).toEqual([{ level: 'info', event: 'sign-in.invite-only' }]);
    expectNoSecretsLogged(result);
  });

  test('a server owner whose access was removed is refused until it is restored', () => {
    const result = runScenario('access-removed');
    expect(result.log.map(line => without(line, 'time'))).toEqual([
      { level: 'info', event: 'sign-in.access-removed', userId: 1 },
      { level: 'info', event: 'sign-in', userId: 1 },
    ]);
    expectNoSecretsLogged(result);
  });

  test('Discord\'s redirect is refused without this browser\'s state, a cancel is reported, and a failed exchange signs no one in', () => {
    const result = runScenario('state');
    // Info lines are on stdout and warnings and errors on stderr, so only the count of each is in order here.
    expect(result.events.sort()).toEqual(['sign-in.cancelled', ...Array(5).fill('sign-in.failed')]);
    expectNoSecretsLogged(result);
  });

  test('without a Discord application or a platform database, the sign-in button reports a failure', () => {
    const missing: Record<string, string>[] = [{ DISCORD_CLIENT_ID: '' }, { DISCORD_CLIENT_SECRET: '' }, { DATABASE_PATH: '' }];
    for (const env of missing) {
      const result = runScenario('not-configured', env);
      expect(result.log.map(line => without(line, 'time', 'stack'))).toEqual([
        { level: 'error', event: 'sign-in.not-configured', message: 'DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET or DATABASE_PATH is not set' },
      ]);
    }
  });

  test('the OAuth exchange posts the code to Discord, uses the token once for the account, and keeps neither', () => {
    expectNoSecretsLogged(runScenario('exchange'));
  });
});

describe('sessions', () => {
  test('a session ends 30 days after its last use, and last seen is written at most once an hour', () => {
    const result = runScenario('expiry');
    expect(result.events).toEqual(['sign-in', 'sign-in']);
    expectNoSecretsLogged(result);
  });

  test('sign out ends this session; sign out everywhere ends all of them', () => {
    const result = runScenario('sign-out');
    expect(result.log.map(line => without(line, 'time'))).toEqual([
      { level: 'info', event: 'sign-in', userId: 1 },
      { level: 'info', event: 'sign-in', userId: 1 },
      { level: 'info', event: 'sign-out', userId: 1 },
      { level: 'info', event: 'sign-in', userId: 1 },
      { level: 'info', event: 'sign-out.everywhere', userId: 1 },
    ]);
    expectNoSecretsLogged(result);
  });

  test('a session survives a restart', () => withPlatformDatabase((run, root) => {
    const before = scenario(run, root, 'before-restart');
    expect(before.fixture.token).toMatch(/^[\w-]{43}$/);
    const after = scenario(run, root, 'after-restart', { EZ_FIXTURE_SESSION_TOKEN: before.fixture.token! });
    expect(after.log).toEqual([]);
    expectNoSecretsLogged(before);
    expectNoSecretsLogged(after);
  }));
});

describe('requests', () => {
  test('a request that changes data is refused when its Origin is missing or is not the public URL\'s', () => {
    const result = runScenario('origin');
    const refused = result.log.filter(line => line.event === 'request.origin-refused');
    expect(refused).toHaveLength(8);
    for (const line of refused) expect(Object.keys(line).sort()).toEqual(['event', 'level', 'message', 'time']);
    expectNoSecretsLogged(result);
  });

  test('no self-hosted route answers without a session', () => {
    expectNoSecretsLogged(runScenario('routes'));
  });
});
