import { describe, expect, test } from 'bun:test';
import { withPlatformDatabase } from './helpers/platform-database';

const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test' };

/** Runs one scenario of tests/fixtures/platform-ruleset-files.ts, which asserts as it goes, and returns the Ruleset events it logged. */
function scenario(name: string) {
  return withPlatformDatabase(run => {
    const result = run('tests/fixtures/platform-ruleset-files.ts', { args: [name], env: SETTINGS });
    if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
    const lines = (result.stdout + result.stderr).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toContainEqual({ fixture: 'passed' });
    return lines.filter(line => 'event' in line && String(line.event).startsWith('ruleset.')).map(line => Object.fromEntries(Object.entries(line).filter(([field]) => field !== 'time')));
  });
}

describe('Ruleset files through their route handlers', () => {
  test('export, import and Load Ruleset version gives the same Draft as loading the original, and changes no Draft, Live configuration or game server', () => {
    const lines = scenario('round-trip');
    const exported = lines.find(line => line.event === 'ruleset.version-exported')!;
    const imported = lines.find(line => line.event === 'ruleset.imported')!;
    // By id and count only: never a Ruleset's name, description or values.
    expect(Object.keys(exported).sort()).toEqual(['event', 'level', 'rulesetId', 'rulesetVersionId', 'userId']);
    expect(Object.keys(imported).sort()).toEqual(['count', 'event', 'level', 'rulesetId', 'rulesetVersionId', 'userId']);
    expect(imported.count).toBe(0);
    expect(JSON.stringify(lines)).not.toContain('Competitive');
  });
  test('a Ruleset name cannot break the Content-Disposition header', () => {
    expect(scenario('filename').filter(line => line.level !== 'info')).toEqual([]);
  });
  test('a file that is too large, not JSON or not the expected format is refused with a clear message and nothing written', () => {
    expect(scenario('refused').filter(line => line.event === 'ruleset.imported')).toEqual([]);
  });
  test('a value with no place in the schema, or one a save would refuse, is dropped and reported, and the rest imports', () => {
    const lines = scenario('dropped');
    expect(lines.filter(line => line.level !== 'info')).toEqual([]);
    expect(lines.filter(line => line.event === 'ruleset.imported').map(line => line.count)).toEqual([15, 1, 2]);
  });
  test('a taken name, ignoring case, is shown, refused on import with nothing written, and can be changed', () => {
    expect(scenario('name-taken').filter(line => line.level !== 'info')).toEqual([]);
  });
  test("another owner's Ruleset answers 404, and export and import need a session and the platform's origin", () => {
    expect(scenario('privacy').filter(line => line.level !== 'info')).toEqual([]);
  });
});
