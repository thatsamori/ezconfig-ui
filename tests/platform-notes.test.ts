import { describe, expect, test } from 'bun:test';
import { withPlatformDatabase } from './helpers/platform-database';

// One made-up platform operator; no real Discord account.
const SETTINGS = { PUBLIC_URL: 'https://ezconfig.test', OPERATOR_DISCORD_IDS: '80351110224678912' };

type Line = Record<string, unknown>;
const without = (line: Line, ...fields: string[]) => Object.fromEntries(Object.entries(line).filter(([field]) => !fields.includes(field)));

/**
 * Runs one scenario of tests/fixtures/platform-notes.ts, which asserts as it
 * goes, on its own database. Returns what it logged, and checks that no body
 * or server owner name it sent appears anywhere it wrote.
 */
function scenario(name: string): Line[] {
  const result = withPlatformDatabase(run => run('tests/fixtures/platform-notes.ts', { args: [name], env: SETTINGS }));
  if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}\n${result.stderr}\n${result.stdout}`);
  const lines = (result.stdout + result.stderr).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line) as Line);
  const fixture = lines.find(line => 'fixture' in line)?.fixture as { scenario: string; secrets: string[] };
  expect(fixture.scenario).toBe(name);
  const written = (result.stdout + result.stderr).split('\n').filter(line => !line.includes('"fixture"')).join('\n');
  expect(fixture.secrets.length).toBeGreaterThan(0);
  for (const secret of fixture.secrets) expect(written).not.toContain(secret);
  return lines.filter(line => !('fixture' in line) && line.event !== 'game-server.registered').map(line => without(line, 'time'));
}

describe('Notes through their route handlers', () => {
  test('the author comes from the session, whatever the request names; every owner reads every Note; a Note is never part of a Draft', () => {
    expect(scenario('author-from-session')).toEqual([
      { level: 'warn', event: 'request.origin-refused', message: 'Refused a request that changes data: its Origin is missing or is not the public URL' },
    ]);
  });
  test('an author edits and deletes only their own Notes; an edit overwrites the body and sets the edited time', () => {
    expect(scenario('own-only')).toEqual([]);
  });
  test('the platform operator deletes any Note and edits none but their own; deleting another owner\'s Note is logged by id', () => {
    expect(scenario('operator')).toEqual([
      { step: 'operator deletes another owner\'s Note' },
      { level: 'info', event: 'note.deleted-by-operator', userId: 2, noteId: 1 },
      { step: 'operator deletes their own Note' },
    ]);
  });
  test('every body is sanitized against the allowlist on save, and on edit', () => {
    expect(scenario('sanitizer')).toEqual([]);
  });
  test('Notes on keys the schema lacks are kept but not shown, edited or deleted', () => {
    expect(scenario('hidden-keys')).toEqual([]);
  });
  test('a deleted server owner\'s Notes stay, by "a former server owner", and only the operator deletes them', () => {
    expect(scenario('former-owner')).toEqual([
      { step: 'operator deletes a former server owner\'s Note' },
      { level: 'info', event: 'note.deleted-by-operator', userId: 3, noteId: 1 },
    ]);
  });
});
