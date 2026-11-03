import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { withPlatformDatabase } from './helpers/platform-database';

const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test', RCON_HOST: '127.0.0.1', RCON_AUTO_SYNC_ENABLED: 'false' };

/** Runs one scenario of tests/fixtures/platform-rulesets.ts, which asserts as it goes, and returns the Ruleset events it logged. */
function scenario(name: string) {
  return withPlatformDatabase((run, root) => {
    const result = run('tests/fixtures/platform-rulesets.ts', { args: [name], env: { ...SETTINGS, DATABASES_PATH: join(root, 'Databases') } });
    if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
    const lines = (result.stdout + result.stderr).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toContainEqual({ fixture: 'passed' });
    return lines.filter(line => 'event' in line && line.event !== 'game-server.registered').map(line => Object.fromEntries(Object.entries(line).filter(([field]) => field !== 'time')));
  });
}
const events = (lines: Record<string, unknown>[]) => lines.map(line => line.event);

describe('Rulesets through their route handlers', () => {
  test('Save as Ruleset version makes version 1 of a new Ruleset or the next (highest + 1), becomes the origin and never applies', () => {
    const lines = scenario('save-new-and-next');
    expect(events(lines)).toEqual(Array(4).fill('ruleset.version-saved'));
    // By id only: never a Ruleset's name, description or values.
    expect(Object.keys(lines[0]).sort()).toEqual(['event', 'gameServerId', 'level', 'rulesetId', 'rulesetVersionId', 'userId']);
  });
  test('loading a version replaces the whole Draft under current categories, counts the dropped values, names refused ones, and sends nothing', () => {
    expect(events(scenario('load'))).toEqual(['ruleset.version-saved', 'ruleset.version-loaded', 'ruleset.version-loaded']);
  });
  test('the Draft and the Live configuration are each modified from their origin, compared exactly over the keys the schema has', () => {
    expect(scenario('modified').filter(line => line.level !== 'info')).toEqual([]);
  });
  test('a Ruleset is renamed with names unique per owner, ignoring case', () => {
    expect(events(scenario('rename'))).toEqual(['ruleset.version-saved', 'ruleset.version-saved', 'ruleset.renamed', 'ruleset.renamed', 'ruleset.renamed', 'ruleset.version-saved']);
  });
  test('deleting a Ruleset removes its versions and clears every origin that pointed into them; the values stay', () => {
    const lines = scenario('delete');
    expect(lines.filter(line => line.event === 'ruleset.deleted').map(({ event, count }) => ({ event, count }))).toEqual([{ event: 'ruleset.deleted', count: 2 }]);
  });
  test("an owner sees and loads only their own Rulesets, and needs a session and the platform's origin", () => {
    expect(scenario('privacy').filter(line => line.level !== 'info')).toEqual([
      { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' },
      { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' },
      { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' },
    ]);
  });
  test('a save or load on a stale revision is refused with the current Draft and changes nothing, two writers included', () => {
    expect(scenario('stale').filter(line => line.level !== 'info')).toEqual([]);
  });
});
