/**
 * The one-time import (online-platform#40), run as a child process on
 * self-hosted folders built here in a temp root, against a fresh migrated
 * database with made-up owners. Deleted with the script after the owner's
 * import (#42).
 */
import { describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sanitizeNoteBody } from '../src/lib/platform/notes';
import { openPlatformDatabase } from '../src/lib/platform/storage';
import { withPlatformDatabase, type PlatformFixtureResult } from './helpers/platform-database';

/** Paths under the temp root's `old/` folder; an object is written as JSON, a string as it is. */
type Files = Record<string, unknown>;

interface Scenario {
  database: Database;
  /** Runs the script with the usual arguments, then `extra`. */
  importer: (...extra: string[]) => PlatformFixtureResult;
  /** The same, with `env` over DATABASE_PATH and the rest. */
  importerWith: (env: Record<string, string>, ...extra: string[]) => PlatformFixtureResult;
  /** Runs the script for Rulesets and Notes only: no --databases, no --game-server. */
  rulesetsAndNotes: (...extra: string[]) => PlatformFixtureResult;
  root: string;
  /** Every row of every table, to compare before and after. */
  dump: () => string;
}

const OWNER = 1, GAME_SERVER = 7;

/** The owner's self-hosted folders, as the self-hosted app wrote them: every drop rule, presets of each kind and Notes by several authors. */
const OLD: Files = {
  'Databases/.revision.json': { revision: 'r', savedAt: null },
  'Databases/.last-apply.json': { appliedAt: '2026-10-01T00:00:00.000Z' },
  'Databases/readme.txt': 'not JSON, and not read',
  'Databases/Character/Movement.json': { MaxWalkSpeed: 450, CanDodge: true, RetiredKey: 1, TimeToMaxSprint: 'fast' },
  // Left over from before the parry-geometry move: Parry is these keys' current category.
  'Databases/Character/Combat.json': { ParryUpTime: 0.31, LowBlockColliderRelativeOffsetLocation: { x: 1, y: 2, z: 3 }, ForwardParryLength: 40 },
  'Databases/Character/Parry.json': { ParryUpTime: 0.31, LowBlockColliderRelativeOffsetLocation: { x: 9, y: 9, z: 9 } },
  'Databases/Character/Camera.json': { CustomFOVMax: 120.5 },
  // CustomFOV is a Camera key: no copy is in its current category's file.
  'Databases/Character/General.json': { CustomFOV: false },
  'Databases/Character/Misc.json': { CustomFOV: true },
  'Databases/Weapon/Greatsword/General.json': { ParryTurnCap: { x: 375, y: 262.5 }, Windup: 1 },
  'Databases/Weapon/Greatsword/Strike.json': { Windup: 0.675, Damage: [50, 45, 40], CanBlock: true },
  'Databases/Weapon/ArmingSword/General.json': { AltWeaponLength: 100 },
  'Databases/Weapon/Claymore/General.json': { CanBlock: true },
  'Presets/User/competitive/manifest.json': { title: ' Competitive ', description: 'For duels\nand nothing else' },
  'Presets/User/competitive/Character/Movement.json': { MaxWalkSpeed: 500 },
  'Presets/User/competitive/Weapon/Axe/Strike.json': { Windup: 0.5 },
  'Presets/User/untitled/manifest.json': { title: '  ', description: '' },
  'Presets/User/untitled/Character/Movement.json': { RetiredKey: 1 },
  'Presets/User/nomanifest/Character/Parry.json': { ParryUpTime: 0.3 },
  'Presets/Static/GameDefault/manifest.json': { title: 'Game default', description: 'Built in' },
  'Presets/Static/Movement/manifest.json': { title: 'Movement', description: 'Static movement' },
  'Presets/Static/Movement/Character/Movement.json': { MaxWalkSpeed: 420, CanDodge: false },
  'Presets/Static/loose.json': {},
  'Notes/character.json': {
    CanDodge: [
      { id: '1', createdBy: 'chris', note: '<p>First</p>' },
      { createdBy: 'alice', note: '<p onclick="steal()">Second<script>steal()</script></p>' },
      { id: '3', createdBy: 'chris', note: '<p>Third</p>' },
    ],
    RetiredKey: [{ id: '4', createdBy: 'bob', note: '<p>Old</p>' }],
    MaxWalkSpeed: [{ createdBy: 'alice', note: '<img src="x">' }, { note: '<b>No author</b>' }],
  },
  'Notes/weapon.json': { Windup: [{ createdBy: 'Chris', note: '<p>Case differs</p>' }], Damage: 'not a list' },
  'Notes/other.json': {},
};

/** Builds `files` under a fresh root's `old/`, with the owner (Discord id 1001) and their game server "Duel NA" registered, and another owner with the same names. */
function scenario<T>(files: Files, work: (scenario: Scenario) => T): T {
  return withPlatformDatabase((run, root) => {
    const old = join(root, 'old');
    for (const folder of ['Databases', 'Presets', 'Notes']) mkdirSync(join(old, folder), { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(old, path)), { recursive: true });
      writeFileSync(join(old, path), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
    const database = openPlatformDatabase(join(root, 'platform.db'));
    try {
      database.exec(`
        INSERT INTO users (id, discord_id, username, first_signed_in_at) VALUES (1, '1001', 'Owner', 0), (2, '1002', 'Other', 0);
        INSERT INTO game_servers (id, owner_id, name, name_key, key_hash, key_last4, registered_at)
          VALUES (7, 1, 'Duel NA', 'duel na', 'hash-7', 'aaaa', 0), (8, 2, 'Duel NA', 'duel na', 'hash-8', 'bbbb', 0);
        INSERT INTO drafts (game_server_id) VALUES (7), (8);
        INSERT INTO rulesets (owner_id, name, name_key, created_at) VALUES (2, 'Competitive', 'competitive', 0);
      `);
      const shared = ['--presets', join(old, 'Presets'), '--notes', join(old, 'Notes'), '--discord-id', '1001', '--old-username', 'chris'];
      const args = ['--databases', join(old, 'Databases'), '--game-server', 'duel na', ...shared];
      const dump = () => JSON.stringify(
        (database.query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[])
          .map(({ name }) => [name, database.query(`SELECT * FROM "${name}"`).all()]),
      );
      const importerWith = (env: Record<string, string>, ...extra: string[]) => run('scripts/import-self-hosted.ts', { args: [...args, ...extra], env });
      const rulesetsAndNotes = (...extra: string[]) => run('scripts/import-self-hosted.ts', { args: [...shared, ...extra], env: {} });
      return work({ database, importer: (...extra) => importerWith({}, ...extra), importerWith, rulesetsAndNotes, root, dump });
    } finally {
      database.close();
    }
  });
}

/** Runs the import with `args` expecting a refusal: exit 1, every problem named, and nothing written even with --commit. */
function expectRefused({ importer, dump }: Scenario, args: string[], ...problems: string[]) {
  const before = dump();
  for (const extra of [[], ['--commit']]) {
    const result = importer(...args, ...extra);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Refused, so nothing was written');
    for (const problem of problems) expect(result.stdout).toContain(problem);
    expect(dump()).toBe(before);
  }
}

const EXPECTED_DRAFT = {
  Character: { MaxWalkSpeed: 450, CanDodge: true, ParryUpTime: 0.31, LowBlockColliderRelativeOffsetLocation: { x: 9, y: 9, z: 9 }, ForwardParryLength: 40 },
  Weapon: { Greatsword: { ParryTurnCap: { x: 375, y: 262.5 }, CanBlock: true, Strike: { Windup: 0.675, Damage: [50, 45, 40] } } },
};

describe('the one-time import', () => {
  test('a dry run reports every destination, drop, Note attribution and sanitized body, and writes nothing', () => {
    scenario(OLD, ({ importer, dump }) => {
      const before = dump();
      const result = importer();
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      const report = result.stdout;
      expect(dump()).toBe(before);
      expect(report).toContain('EZConfig one-time import: dry run, nothing is written');
      expect(report).toContain('Server owner: Owner (Discord id 1001)');
      expect(report).toContain('Draft of game server "Duel NA": 9 values, origin "Self-hosted" version 1. No Live configuration until you review it and Apply.');
      expect(report).toContain('Ruleset "Self-hosted" version 1: 9 values (9 dropped), from Databases (--ruleset-name)');
      expect(report).toContain('Ruleset "Competitive" version 1: 2 values, from Presets/User/competitive (manifest title), description "For duels\\nand nothing else"');
      expect(report).toContain('Ruleset "nomanifest" version 1: 1 value, from Presets/User/nomanifest (folder name)');
      expect(report).toContain('Ruleset "untitled" version 1: 0 values (1 dropped), from Presets/User/untitled (folder name)');
      expect(report).toContain('Ruleset "Movement" version 1: 2 values, from Presets/Static/Movement (manifest title), description "Static movement"');
      expect(report).not.toContain('Ruleset "Game default"');
      // Every dropped value, with its database, weapon class, key, file and reason.
      for (const line of [
        'Dropped values: 10',
        'Character / RetiredKey in Databases/Character/Movement.json: Unknown config key',
        'Character / TimeToMaxSprint in Databases/Character/Movement.json: Expected Float, got String',
        'Character / LowBlockColliderRelativeOffsetLocation in Databases/Character/Combat.json: Differs from Databases/Character/Parry.json, the file of its current category',
        'Character / CustomFOVMax in Databases/Character/Camera.json: Use a whole number.',
        'Character / CustomFOV in Databases/Character/General.json: Differs between files, and none is Camera.json, its current category',
        'Character / CustomFOV in Databases/Character/Misc.json: Differs between files, and none is Camera.json, its current category',
        'Weapon / Greatsword / Windup in Databases/Weapon/Greatsword/General.json: An attack key outside an attack file (Strike, AltStrike, Stab or AltStab.json)',
        'Weapon / ArmingSword / AltWeaponLength in Databases/Weapon/ArmingSword/General.json: ArmingSword does not have this key',
        'Weapon / Claymore / CanBlock in Databases/Weapon/Claymore/General.json: Unknown weapon class',
        'Character / RetiredKey in Presets/User/untitled/Character/Movement.json: Unknown config key',
      ]) expect(report).toContain(line);
      // Matching copies are one value, never a drop.
      expect(report).not.toContain('Character / ParryUpTime');
      for (const line of [
        'Not read: 4',
        'Databases/readme.txt: not in Character/ or Weapon/',
        'Presets/Static/GameDefault: the built-in preset',
        'Presets/Static/loose.json: not a preset folder',
        'Notes/other.json: not character.json or weapon.json',
      ]) expect(report).toContain(line);
      expect(report).not.toContain('.revision.json');
      for (const line of [
        'Notes: 6',
        'Yours (by old username "chris"): 2',
        'With no author ("a former server owner"): 4 (by "alice": 1, by "bob": 1, by no one recorded: 1, by "Chris": 1)',
        'On keys the schema lacks, imported and hidden: 1',
        '    Character / RetiredKey: 1',
        'Bodies the sanitizer changed: 2',
        'Notes/character.json CanDodge, Note 2 by "alice"',
        '      before: <p onclick="steal()">Second<script>steal()</script></p>',
        '      after:  <p>Second</p>',
        'Notes/character.json MaxWalkSpeed, Note 2',
        '      after:  <strong>No author</strong>',
        'Dropped: 2',
        'Notes/character.json MaxWalkSpeed, Note 1: no text is left once sanitized',
        'Notes/weapon.json Damage: not a list of Notes',
      ]) expect(report).toContain(line);
      expect(report).toContain('Dry run passed. Run again with --commit to import.');
    });
  });

  test('--commit writes the Draft with its "Self-hosted" origin, a Ruleset per preset and the Notes, then refuses to run again', () => {
    scenario(OLD, scenarioState => {
      const { database, importer } = scenarioState;
      const started = Date.now();
      const result = importer('--commit', '--ruleset-name', ' From the VPS ');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Imported: the Draft, 5 Rulesets and 6 Notes. Nothing reaches the game server until you review its Draft and Apply.');

      const rulesets = database.query('SELECT id, owner_id, name, name_key, created_at FROM rulesets WHERE owner_id = ? ORDER BY id').all(OWNER) as { id: number; name: string; name_key: string; created_at: number }[];
      expect(rulesets.map(({ name, name_key }) => [name, name_key])).toEqual([
        ['From the VPS', 'from the vps'], ['Competitive', 'competitive'], ['nomanifest', 'nomanifest'], ['untitled', 'untitled'], ['Movement', 'movement'],
      ]);
      const now = rulesets[0].created_at;
      expect(now).toBeGreaterThanOrEqual(started);
      const versions = database.query('SELECT id, ruleset_id, number, description, overrides, saved_at FROM ruleset_versions ORDER BY id').all() as { id: number; ruleset_id: number; number: number; description: string | null; overrides: string; saved_at: number }[];
      expect(versions.map(({ ruleset_id, number, description, saved_at }) => [ruleset_id, number, description, saved_at])).toEqual([
        [rulesets[0].id, 1, null, now], [rulesets[1].id, 1, 'For duels\nand nothing else', now], [rulesets[2].id, 1, null, now],
        [rulesets[3].id, 1, null, now], [rulesets[4].id, 1, 'Static movement', now],
      ]);
      expect(rulesets.every(ruleset => ruleset.created_at === now)).toBe(true);
      expect(versions.map(version => JSON.parse(version.overrides))).toEqual([
        EXPECTED_DRAFT,
        { Character: { MaxWalkSpeed: 500 }, Weapon: { Axe: { Strike: { Windup: 0.5 } } } },
        { Character: { ParryUpTime: 0.3 } },
        {},
        { Character: { MaxWalkSpeed: 420, CanDodge: false } },
      ]);

      // The Draft: Databases' values, saved once at the import time, with "Self-hosted" version 1 as its origin; nothing applied.
      const draft = database.query('SELECT overrides, revision, saved_at, origin_id FROM drafts WHERE game_server_id = ?').get(GAME_SERVER) as { overrides: string; revision: number; saved_at: number; origin_id: number };
      expect({ ...draft, overrides: JSON.parse(draft.overrides) }).toEqual({ overrides: EXPECTED_DRAFT, revision: 1, saved_at: now, origin_id: versions[0].id });
      expect(database.query('SELECT count(*) AS count FROM live_configurations').get()).toEqual({ count: 0 });
      // The other owner's game server, Draft and Ruleset of the same names are untouched.
      expect(database.query('SELECT overrides, revision, saved_at, origin_id FROM drafts WHERE game_server_id = 8').get()).toEqual({ overrides: '{}', revision: 0, saved_at: null, origin_id: null });
      expect(database.query('SELECT count(*) AS count FROM rulesets WHERE owner_id = 2').get()).toEqual({ count: 1 });

      // Notes: the old username's become the owner's, the rest have no author; sanitized, at the import time, in file order.
      const notes = database.query('SELECT database_name, key_name, author_id, body, created_at, edited_at FROM notes ORDER BY id').all();
      const note = (database_name: string, key_name: string, author_id: number | null, original: string) =>
        ({ database_name, key_name, author_id, body: sanitizeNoteBody(original), created_at: now, edited_at: null });
      expect(notes).toEqual([
        note('Character', 'CanDodge', OWNER, '<p>First</p>'),
        note('Character', 'CanDodge', null, '<p onclick="steal()">Second<script>steal()</script></p>'),
        note('Character', 'CanDodge', OWNER, '<p>Third</p>'),
        note('Character', 'RetiredKey', null, '<p>Old</p>'),
        note('Character', 'MaxWalkSpeed', null, '<b>No author</b>'),
        note('Weapon', 'Windup', null, '<p>Case differs</p>'),
      ]);
      expect(notes[1]).toMatchObject({ body: '<p>Second</p>' });

      // A second run finds its own work: the Draft was saved and every name is taken.
      expectRefused(scenarioState, ['--ruleset-name', 'From the VPS'],
        'The Draft of "Duel NA" was saved (revision 1), and the import fills only a Draft never saved.',
        'Owner already has a Ruleset called "From the VPS", the name Databases (--ruleset-name) would take.',
        'Owner already has a Ruleset called "Movement", the name Presets/Static/Movement (manifest title) would take.',
        '6 of the Notes to import are already on the platform');
      // Deleting the game server's work and the Rulesets is not enough to import the Notes twice.
      database.exec("DELETE FROM rulesets WHERE owner_id = 1; UPDATE drafts SET overrides = '{}', revision = 0, saved_at = NULL WHERE game_server_id = 7");
      expectRefused(scenarioState, [], '6 of the Notes to import are already on the platform, on the same key with the same body, as if the import ran before.');
    });
  });

  test('with no --databases and --game-server it imports only the Rulesets and Notes, whatever the game servers hold', () => {
    scenario(OLD, ({ database, rulesetsAndNotes, dump }) => {
      // The owner's game server has been edited and applied to, which the Draft import refuses.
      database.exec(`UPDATE drafts SET overrides = '{"Character":{"CanDodge":false}}', revision = 2, saved_at = 5 WHERE game_server_id = 7;
        INSERT INTO live_configurations (game_server_id, id, overrides, applied_at) VALUES (7, 'live-1', '{}', 5)`);
      const drafts = () => database.query('SELECT * FROM drafts ORDER BY game_server_id').all();
      const lives = () => database.query('SELECT * FROM live_configurations').all();
      const draftsBefore = drafts(), livesBefore = lives();
      const args = ['--old-username', 'Chris', '--note-author', 'alice=1002'];

      const before = dump();
      const dry = rulesetsAndNotes(...args);
      expect(dry.stderr).toBe('');
      expect(dry.exitCode).toBe(0);
      expect(dump()).toBe(before);
      for (const line of [
        'Server owner: Owner (Discord id 1001)',
        'Destinations',
        'Ruleset "Competitive" version 1: 2 values, from Presets/User/competitive (manifest title)',
        'Yours (by old username "chris", "Chris"): 3',
        'Other (by old username "alice", Discord id 1002): 1',
        'With no author ("a former server owner"): 2 (by "bob": 1, by no one recorded: 1)',
        'Dry run passed. Run again with --commit to import.',
      ]) expect(dry.stdout).toContain(line);
      expect(dry.stdout).not.toContain('Draft of game server');
      expect(dry.stdout).not.toContain('Self-hosted');

      const result = rulesetsAndNotes(...args, '--commit');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Imported: 4 Rulesets and 6 Notes. No game server was touched.');

      expect((database.query('SELECT name FROM rulesets WHERE owner_id = ? ORDER BY id').all(OWNER) as { name: string }[]).map(row => row.name))
        .toEqual(['Competitive', 'nomanifest', 'untitled', 'Movement']);
      expect(drafts()).toEqual(draftsBefore);
      expect(lives()).toEqual(livesBefore);
      expect(database.query('SELECT key_name, author_id FROM notes ORDER BY id').all()).toEqual([
        { key_name: 'CanDodge', author_id: OWNER },
        { key_name: 'CanDodge', author_id: 2 },
        { key_name: 'CanDodge', author_id: OWNER },
        { key_name: 'RetiredKey', author_id: null },
        { key_name: 'MaxWalkSpeed', author_id: null },
        { key_name: 'Windup', author_id: OWNER },
      ]);

      // It still cannot run twice.
      const again = rulesetsAndNotes(...args, '--commit');
      expect(again.exitCode).toBe(1);
      expect(again.stdout).toContain('6 of the Notes to import are already on the platform');
      expect(again.stdout).toContain('Owner already has a Ruleset called "Competitive"');
    });
  });

  test('refuses a --note-author with no server owner on the platform', () => {
    scenario(OLD, ({ rulesetsAndNotes, dump }) => {
      const before = dump();
      for (const extra of [[], ['--commit']]) {
        const result = rulesetsAndNotes('--note-author', 'alice=9999', ...extra);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('Refused, so nothing was written');
        expect(result.stdout).toContain('No server owner has Discord id 9999, named for Notes by "alice": that account must sign in to the platform first.');
        expect(dump()).toBe(before);
      }
    });
  });

  test('--databases and --game-server go together, and each old username has one author', () => {
    scenario({}, ({ rulesetsAndNotes }) => {
      for (const [extra, message] of [
        [['--databases', '.'], '--databases and --game-server go together'],
        [['--game-server', 'Duel NA'], '--databases and --game-server go together'],
        [['--note-author', 'alice'], '--note-author alice: use <old username>=<Discord id>'],
        [['--note-author', '=1002'], '--note-author =1002: use <old username>=<Discord id>'],
        [['--note-author', 'alice=x'], '--note-author alice=x: use <old username>=<Discord id>'],
        [['--note-author', 'chris=1002'], '--note-author chris=1002: "chris" has an author already'],
        [['--note-author', 'alice=1002', '--note-author', 'alice=1001'], '--note-author alice=1001: "alice" has an author already'],
      ] as const) {
        const result = rulesetsAndNotes(...extra);
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain(message);
      }
    });
  });

  test('refuses when the Draft was ever saved', () => {
    scenario(OLD, state => {
      state.database.exec('UPDATE drafts SET overrides = \'{"Character":{"CanDodge":false}}\', revision = 2, saved_at = 5 WHERE game_server_id = 7');
      expectRefused(state, [], 'The Draft of "Duel NA" was saved (revision 2)');
    });
  });

  test('refuses when the game server has a Live configuration', () => {
    scenario(OLD, state => {
      state.database.exec("INSERT INTO live_configurations (game_server_id, id, overrides, applied_at) VALUES (7, 'live-1', '{}', 5)");
      expectRefused(state, [], '"Duel NA" has a Live configuration');
    });
  });

  test('refuses when the owner already has a Ruleset name it would create, ignoring case', () => {
    scenario(OLD, state => {
      state.database.exec("INSERT INTO rulesets (owner_id, name, name_key, created_at) VALUES (1, 'SELF-HOSTED', 'self-hosted', 0)");
      expectRefused(state, [], 'Owner already has a Ruleset called "SELF-HOSTED", the name Databases (--ruleset-name) would take.');
    });
  });

  test('refuses when two names inside the import collide, ignoring case', () => {
    scenario({
      'Presets/User/a/manifest.json': { title: 'Duel', description: '' },
      'Presets/User/b/manifest.json': { title: 'duel', description: '' },
      'Presets/Static/self-hosted/Character/Movement.json': { MaxWalkSpeed: 450 },
    }, state => {
      expectRefused(state, [],
        '2 Rulesets would be called "Duel" (names ignore case): "Duel" from Presets/User/a (manifest title), "duel" from Presets/User/b (manifest title). Edit a copied manifest\'s title.',
        '2 Rulesets would be called "Self-hosted" (names ignore case): "Self-hosted" from Databases (--ruleset-name), "self-hosted" from Presets/Static/self-hosted (folder name). Edit a copied manifest\'s title or pass another --ruleset-name.');
    });
  });

  test('refuses without the owner or their game server', () => {
    scenario({}, state => {
      expectRefused(state, ['--discord-id', '9999'], 'No server owner has Discord id 9999: sign in to the platform with that account first.');
      // The other owner's game server of that name is not the owner's.
      expectRefused(state, ['--game-server', 'Duel EU'], 'Owner has no game server called "Duel EU": register it on the platform first.');
    });
  });

  test('a file that is not a JSON object fails the import; a dropped value never does', () => {
    scenario({
      'Databases/Character/Movement.json': '{ "MaxWalkSpeed": 4',
      'Databases/Character/Parry.json': '[1, 2]',
      'Presets/User/broken/manifest.json': '{ "title": ',
      'Notes/weapon.json': '',
    }, state => {
      expectRefused(state, [],
        'Databases/Character/Movement.json is not valid JSON',
        'Databases/Character/Parry.json is not a JSON object',
        'Presets/User/broken/manifest.json is not valid JSON',
        'Notes/weapon.json is not valid JSON');
    });
  });

  test("never creates or migrates the database: it needs one at this release's version", () => {
    scenario(OLD, ({ importerWith, root }) => {
      const missing = join(root, 'missing.db');
      const none = importerWith({ DATABASE_PATH: missing }, '--commit');
      expect(none.exitCode).toBe(1);
      expect(none.stderr).toContain(`No platform database at ${missing}: start the app once, which creates it.`);
      expect(existsSync(missing)).toBe(false);
      const older = join(root, 'older.db');
      const database = openPlatformDatabase(older);
      database.exec('PRAGMA user_version = 3');
      database.close();
      const behind = importerWith({ DATABASE_PATH: older }, '--commit');
      expect(behind.exitCode).toBe(1);
      expect(behind.stderr).toMatch(/^The platform database is at version 3 and this release expects \d+: run the import from the release the app runs, after it has started\./);
    });
  });

  test('needs every argument and takes no other', () => {
    scenario({}, ({ importer }) => {
      const missing = importer('--old-username', '');
      expect(missing.exitCode).toBe(2);
      expect(missing.stderr).toContain('Missing --old-username');
      const unknown = importer('--force');
      expect(unknown.exitCode).toBe(2);
      expect(unknown.stderr).toContain('Usage:');
    });
  });
});
