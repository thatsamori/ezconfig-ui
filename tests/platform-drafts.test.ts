import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { withPlatformDatabase } from './helpers/platform-database';

const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test', RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false' };

/** Runs one scenario of tests/fixtures/platform-drafts.ts, which asserts as it goes, and returns the events it logged: Draft writes log nothing but errors. */
function scenario(name: string) {
  return withPlatformDatabase((run, root) => {
    const result = run('tests/fixtures/platform-drafts.ts', { args: [name], env: { ...SETTINGS, DATABASES_PATH: join(root, 'Databases') } });
    if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
    const lines = (result.stdout + result.stderr).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toContainEqual({ fixture: 'passed' });
    return lines.filter(line => 'event' in line && line.event !== 'game-server.registered').map(line => Object.fromEntries(Object.entries(line).filter(([field]) => field !== 'time')));
  });
}

describe("a game server's Draft through its route handlers", () => {
  test('loads and saves as one document keyed by database, weapon class and key name, placed under current categories on load', () => {
    expect(scenario('load-and-save')).toEqual([]);
  });
  test('refuses a save whose document holds a value the schema refuses, camera policy included, saving nothing', () => {
    expect(scenario('validation')).toEqual([]);
  });
  test('refuses a save or reset on a stale revision with the current Draft', () => {
    expect(scenario('stale')).toEqual([]);
  });
  test('Reset to game defaults empties the Draft, with the revision checked', () => {
    expect(scenario('reset')).toEqual([]);
  });
  test('drops values whose key or weapon class the schema lacks from what loads, counts them, and keeps them as stored', () => {
    expect(scenario('dropped-on-load')).toEqual([]);
  });
  test('keeps a value set equal to its game default as an override; a reset removes the key', () => {
    expect(scenario('pins')).toEqual([]);
  });
  test("reads another owner's Draft as missing, and needs a session and the platform's origin", () => {
    expect(scenario('ownership')).toEqual([
      { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' },
    ]);
  });
});
