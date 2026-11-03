import { describe, expect, test } from 'bun:test';
import { withPlatformDatabase } from './helpers/platform-database';

// The instance settings sign-in reads (.env.example); no real Discord application.
const SETTINGS = {
  PUBLIC_URL: 'https://ezconfig.test',
  DISCORD_CLIENT_ID: '1300000000000000000',
  DISCORD_CLIENT_SECRET: 'fixture-client-secret',
  DISCORD_REDIRECT_URL: '',
  OPERATOR_DISCORD_IDS: '80351110224678912',
};

type Line = Record<string, unknown>;
type Fixture = { scenario: string; secrets: string[] };
const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));

/** Runs one scenario of the Invites fixture on its own database; info lines (stdout) and warnings (stderr) come back apart. */
function runScenario(name: string) {
  const result = withPlatformDatabase(run => run('tests/fixtures/platform-invites.ts', {
    args: [name],
    env: SETTINGS,
  }));
  if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const out = parse(result.stdout), err = parse(result.stderr);
  const fixture = out.find(line => 'fixture' in line)?.fixture as Fixture;
  const info = out.filter(line => !('fixture' in line));
  for (const line of [...info, ...err]) expect(Date.parse(line.time as string)).toBeGreaterThan(0);
  return { ...result, fixture, info: info.map(line => without(line, 'time')), problems: err.map(line => without(line, 'time', 'stack')) };
}

/** No Invite code or link, session token, Discord id, name or OAuth code appears anywhere the process wrote, besides its own result line. */
function expectNoSecretsLogged({ stdout, stderr, fixture }: ReturnType<typeof runScenario>) {
  const written = stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + stderr;
  expect(fixture.secrets.some(secret => /^https:\/\/ezconfig\.test\/api\/auth\/discord\?invite=/.test(secret))).toBe(true);
  for (const secret of fixture.secrets) expect(written).not.toContain(secret);
  expect(written).not.toContain('invite=');
  expect(written).not.toContain('ezconfig_session=');
  expect(written).not.toContain('ezconfig_invite=');
}

const info = (event: string, ids: Line = {}) => ({ level: 'info', event, ...ids });
const made = (inviteId: number) => info('invite.made', { userId: 1, inviteId });

describe('Invites', () => {
  test('only the platform operator makes, lists and revokes Invites; a server owner is refused, and each action is logged', () => {
    const result = runScenario('operator-only');
    expect(result.info).toEqual([
      info('sign-in', { userId: 1 }), made(1), made(2),
      info('sign-in', { userId: 2, inviteId: 1 }),
      info('invite.revoked', { userId: 1, inviteId: 2 }),
    ]);
    const refused = { level: 'warn', event: 'operator.refused', userId: 2, message: 'Refused an operator request from a server owner who is not a platform operator' };
    expect(result.problems).toEqual([refused, refused, refused, ...Array(2).fill(expect.objectContaining({ event: 'request.origin-refused' }))]);
    expectNoSecretsLogged(result);
  });

  test('making an Invite shows its link once; only the code\'s hash is stored, with made by, made time and an expiry 7 days later', () => {
    const result = runScenario('make');
    expect(result.info).toEqual([info('sign-in', { userId: 1 }), made(1), made(2), info('invite.revoked', { userId: 1, inviteId: 1 })]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });

  test('a Discord account with no record that signs in through a valid Invite becomes a server owner, and the Invite records who and when', () => {
    const result = runScenario('redeem');
    expect(result.info).toEqual([
      info('sign-in', { userId: 1 }), made(1),
      info('sign-in', { userId: 2, inviteId: 1 }),
      info('sign-in', { userId: 2 }),
      info('sign-in.invite-only', { inviteId: 1 }),
      made(2), info('sign-in.cancelled'),
      info('sign-in', { userId: 3, inviteId: 2 }),
    ]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });

  test('a server owner who opens an Invite is just signed in and the Invite stays unused; removed access is refused even with one', () => {
    const result = runScenario('existing-owner');
    expect(result.info).toEqual([
      info('sign-in', { userId: 1 }), made(1),
      info('sign-in', { userId: 2, inviteId: 1 }), made(2),
      info('sign-in', { userId: 2 }),
      info('sign-in', { userId: 1 }),
      info('sign-in.access-removed', { userId: 2 }),
      info('sign-in', { userId: 3, inviteId: 2 }),
    ]);
    expectNoSecretsLogged(result);
  });

  test('an expired, revoked, used, unknown or malformed Invite is refused as invite-only, and nothing about the account is stored', () => {
    const result = runScenario('refused');
    expect(result.info).toEqual([
      info('sign-in', { userId: 1 }), made(1), made(2), made(3), made(4),
      info('invite.revoked', { userId: 1, inviteId: 2 }),
      info('sign-in', { userId: 2, inviteId: 3 }),
      info('sign-in.invite-only', { inviteId: 2 }),
      info('sign-in.invite-only', { inviteId: 3 }),
      info('sign-in.invite-only'),
      info('sign-in.invite-only'),
      info('sign-in', { userId: 3, inviteId: 4 }),
      info('sign-in.invite-only', { inviteId: 1 }),
    ]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });
});

describe('the daily sweep', () => {
  test('startup schedules it a minute after start and then daily; it deletes expired sessions, and an unused Invite\'s row 30 days after it expires or is revoked', () => {
    const result = runScenario('sweep');
    const sweep = info('sweep');
    expect(result.info).toEqual([
      info('sign-in', { userId: 1 }), info('sign-in', { userId: 1 }), made(1),
      info('sign-in', { userId: 2, inviteId: 1 }), made(2), made(3),
      // Days 0 and 1, the revoke, days 2 to 37, then one schedule after the hook runs again.
      sweep, sweep, info('invite.revoked', { userId: 1, inviteId: 3 }), ...Array(36).fill(sweep), sweep, sweep,
    ]);
    expect(result.problems).toEqual([]);
    expectNoSecretsLogged(result);
  });
});
