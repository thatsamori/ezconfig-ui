import { describe, expect, test } from 'bun:test';
import { withPlatformDatabase } from './helpers/platform-database';

// The instance settings sign-in reads (.env.example): two made-up platform operators, no real Discord application.
const SETTINGS = {
  PUBLIC_URL: 'https://ezconfig.test',
  DISCORD_CLIENT_ID: '1300000000000000000',
  DISCORD_CLIENT_SECRET: 'fixture-client-secret',
  DISCORD_REDIRECT_URL: '',
  OPERATOR_DISCORD_IDS: '80351110224678912, 11111111111111111',
  RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false',
};

type Line = Record<string, unknown>;
type Fixture = { scenario: string; secrets: string[] };
const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));
/** The lines this ticket's tests are about: operator actions on server owners, the sign-ins they refuse, and refused requests. */
const ABOUT = new Set(['sign-in.access-removed', 'sign-in.invite-only', 'operator.refused', 'request.origin-refused']);

/**
 * Runs one scenario of tests/fixtures/platform-server-owners.ts, which asserts
 * as it goes, on its own database. Returns its step markers and the log lines
 * it is about, info (stdout) then warnings (stderr), and checks that nothing
 * it handled as a secret appears anywhere it wrote.
 */
function scenario(name: string): Line[] {
  const result = withPlatformDatabase(run => run('tests/fixtures/platform-server-owners.ts', { args: [name], env: SETTINGS }));
  if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const parse = (text: string) => text.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const out = parse(result.stdout), err = parse(result.stderr);
  const fixture = out.find(line => 'fixture' in line)?.fixture as Fixture;
  expect(fixture.scenario).toBe(name);
  const written = result.stdout.split('\n').filter(line => !line.includes('"fixture"')).join('\n') + result.stderr;
  expect(fixture.secrets.length).toBeGreaterThan(0);
  for (const secret of fixture.secrets) expect(written).not.toContain(secret);
  expect(written).not.toContain('ezconfig_session=');
  expect(written).not.toContain(SETTINGS.DISCORD_CLIENT_SECRET);
  const about = (line: Line) => 'step' in line || String(line.event).startsWith('server-owner.') || ABOUT.has(line.event as string);
  return [...out.filter(line => !('fixture' in line)), ...err].filter(about).map(line => without(line, 'time'));
}

describe('the platform operator manages server owners, through the route handlers', () => {
  test('the list shows each server owner\'s name, avatar, first sign-in, last seen and number of game servers; only to the operator', () => {
    expect(scenario('list')).toEqual([
      { step: 'a server owner who is not the operator' },
      { step: 'signed out, and from another site' },
      { level: 'warn', event: 'operator.refused', userId: 2, message: 'Refused an operator request from a server owner who is not a platform operator' },
      { level: 'warn', event: 'operator.refused', userId: 2, message: 'Refused an operator request from a server owner who is not a platform operator' },
      { level: 'warn', event: 'operator.refused', userId: 2, message: 'Refused an operator request from a server owner who is not a platform operator' },
      { level: 'warn', event: 'operator.refused', userId: 2, message: 'Refused an operator request from a server owner who is not a platform operator' },
      { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' },
    ]);
  });

  test('Remove access ends their sessions and refuses sign-in, even with an Invite; their data stays and their game servers are still answered', () => {
    expect(scenario('remove-access')).toEqual([
      { step: 'remove access' },
      { level: 'info', event: 'server-owner.access-removed', userId: 1, serverOwnerId: 2 },
      { step: 'remove access again' },
      { step: 'sign-in refused' },
      { level: 'info', event: 'sign-in.access-removed', userId: 2 },
      { level: 'info', event: 'sign-in.access-removed', userId: 2 },
      { step: 'data kept' },
      { step: 'game server still answered' },
      { step: 'build change' },
    ]);
  });

  test('Restore access clears the time and they sign in again to their data', () => {
    expect(scenario('restore-access')).toEqual([
      { step: 'remove access' },
      { level: 'info', event: 'server-owner.access-removed', userId: 1, serverOwnerId: 2 },
      { level: 'info', event: 'sign-in.access-removed', userId: 2 },
      { step: 'restore access' },
      { level: 'info', event: 'server-owner.access-restored', userId: 1, serverOwnerId: 2 },
      { step: 'restore access not removed' },
      { step: 'no such server owner' },
    ]);
  });

  test('Delete, behind the typed confirm, removes everything that was theirs alone; their Notes and the Supported build read "a former server owner"', () => {
    expect(scenario('delete')).toEqual([
      { step: 'not confirmed' },
      { step: 'delete' },
      { level: 'info', event: 'server-owner.deleted', userId: 1, serverOwnerId: 2, count: 2 },
      { step: 'the cascade' },
      { step: 'gone' },
      { level: 'info', event: 'sign-in.invite-only' },
    ]);
  });

  test('no action is taken against a platform operator, themselves or another, and each refusal is logged by id', () => {
    const refusals = (serverOwnerId: number) => [
      { level: 'warn', event: 'server-owner.operator-refused', userId: 1, serverOwnerId, message: 'Refused to remove a platform operator\'s access' },
      { level: 'warn', event: 'server-owner.operator-refused', userId: 1, serverOwnerId, message: 'Refused to restore a platform operator\'s access' },
      { level: 'warn', event: 'server-owner.operator-refused', userId: 1, serverOwnerId, message: 'Refused to delete a platform operator' },
    ];
    expect(scenario('operator-refused')).toEqual([{ step: 'refused' }, ...refusals(2), ...refusals(1)]);
  });

  test('no operator page or route returns another owner\'s game servers, Drafts, Live configurations or Rulesets', () => {
    expect(scenario('no-cross-owner-reads')).toEqual([]);
  });
});
