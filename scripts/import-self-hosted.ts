/**
 * The one-time import (online-platform#40): the owner's self-hosted data,
 * copied to the instance, comes onto the platform once, at cutover. Run by
 * hand against DATABASE_PATH (the ticket's Comments have the commands). It
 * and its test are deleted after the owner's import (#42).
 *
 *   bun --no-env-file run scripts/import-self-hosted.ts --presets <dir> --notes <dir> --discord-id <id>
 *     --old-username <name> ... [--note-author <old username>=<discord id> ...]
 *     [--databases <dir> --game-server <name> [--ruleset-name <name>]] [--commit]
 *
 * - With --databases and --game-server: Databases/ becomes the named game
 *   server's Draft, and version 1 of the "Self-hosted" Ruleset (--ruleset-name),
 *   which is the Draft's origin. Nothing is applied: the game server has no Live
 *   configuration until the owner reviews the Draft and Applies. Without them,
 *   no game server, Draft or Live configuration is read or written.
 * - Each preset in Presets/User/, and in Presets/Static/ except GameDefault,
 *   becomes a Ruleset with one version 1: named after its manifest title, or
 *   its folder if the title is empty or the manifest missing, with the
 *   manifest's description.
 * - Notes by an --old-username become the owner's, those by a --note-author's
 *   old username become that server owner's, and the rest have no author. All
 *   get the import time as created time, in file order, and pass the Note
 *   sanitizer. Notes on keys the schema lacks are imported and hidden.
 *
 * Values are read by key name, with no category, and placed as loading a
 * Ruleset version places them (valuesDocument.ts). A value with no place, or
 * one a Draft save would refuse, is dropped and reported; one dropped value
 * never fails the import. A key in two files is imported once if the values
 * match; if not, the file of its current category wins. A file that is not a
 * JSON object fails the import: skipping a Databases file would make the
 * first Apply wipe values the game server runs.
 *
 * A dry run unless --commit: it prints the report and writes nothing.
 * --commit writes everything in one transaction, or nothing. Either way it
 * refuses when a Ruleset name it would create is taken (ignoring case), two of
 * its names collide, its Notes are already there, or a --note-author has no
 * server owner; so it cannot run twice. With a game server, it also refuses
 * when the Draft was ever saved or the game server has a Live configuration.
 *
 * It reads the old formats itself, as the self-hosted app wrote them, so it
 * needs none of the self-hosted code (#41 removes it):
 * - Databases/Character/<category>.json and Databases/Weapon/<class>/<category>.json,
 *   each {key: value}. A weapon's attack keys are in Strike, AltStrike, Stab
 *   or AltStab.json. Dotfiles (.revision.json, .last-apply.json, ...) are
 *   the app's own records.
 * - Presets/User/<folder>/ and Presets/Static/<folder>/: manifest.json
 *   ({title, description}) beside the same Character/ and Weapon/ layout.
 * - Notes/character.json and Notes/weapon.json, each {key: [{id, createdBy, note}]}.
 */
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { addField, documentFields, fieldError, type DocumentField, type ValuesDocument } from '../src/lib/config/valuesDocument';
import { CategoryName, WEAPON_CONFIG_OPTIONS, WeaponConfigAttackName } from '../src/lib/config/weaponConfigSchema';
import { loadDraft, readDraft } from '../src/lib/platform/drafts';
import { readGameServerName } from '../src/lib/platform/game-servers';
import { readLiveConfiguration } from '../src/lib/platform/live-configurations';
import { hasNoteText, isNoteKey, sanitizeNoteBody, type NoteDatabase } from '../src/lib/platform/notes';
import { readDescription, readRulesetName } from '../src/lib/platform/rulesets';
import { closePlatformStore, platformStore, readPlatformMigrations } from '../src/lib/platform/storage';
import { findServerOwnerByDiscordId } from '../src/lib/platform/users';

const USAGE = `Usage: bun --no-env-file run scripts/import-self-hosted.ts --presets <Presets folder> --notes <Notes folder>
  --discord-id <your Discord user id> --old-username <a self-hosted username of yours; repeat for several>
  [--note-author <someone else's self-hosted username>=<their Discord user id>; repeat for several]
  [--databases <Databases folder> --game-server <game server name> [--ruleset-name <name of the Ruleset Databases becomes; default "Self-hosted">]]
  [--commit]
With DATABASE_PATH set to the platform database. A dry run until --commit.`;

/** One value as an old file holds it. `category` is the file's name without .json. */
interface FoundValue { file: string; database: 'Character' | 'Weapon'; weaponClass: string | null; category: string; key: string; value: unknown }
interface DroppedValue { file: string; database: 'Character' | 'Weapon'; weaponClass: string | null; key: string; reason: string }
/** One folder's values as a values document, each once; `count` is how many it holds. */
interface Values { document: ValuesDocument; count: number; dropped: DroppedValue[] }
interface NewRuleset { name: string; nameKey: string; source: string; description: string | null; values: Values }
interface FoundNote { file: string; database: NoteDatabase; key: string; position: number; createdBy: string | null; original: string; body: string }
interface DroppedNote { file: string; key: string; position: number | null; reason: string }

class Refused extends Error {
  constructor(readonly problems: string[]) { super('Refused'); }
}

/** Anything that refuses the import: nothing is written while there is one. */
const problems: string[] = [];
/** Files and folders the old layout has no place for: listed, never read. */
const notRead: string[] = [];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const quoted = (text: string) => JSON.stringify(text);

function stop(message: string, exitCode: number): never {
  closePlatformStore();
  console.error(message);
  process.exit(exitCode);
}

/** A folder's entries by name, without dotfiles. */
const list = (path: string): Dirent[] =>
  readdirSync(path, { withFileTypes: true }).filter(entry => !entry.name.startsWith('.')).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

/** A JSON object file; anything else is a problem. */
function readObject(path: string, shown: string): Record<string, unknown> | undefined {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    problems.push(`${shown} ${error instanceof SyntaxError ? 'is not valid JSON' : 'cannot be read'}: ${(error as Error).message}`);
    return undefined;
  }
  if (isObject(value)) return value;
  problems.push(`${shown} is not a JSON object`);
  return undefined;
}

/** Every value in a folder laid out as Databases/ is, in file order. `own` names the other files the folder may hold. */
function readConfigurationFolder(path: string, shown: string, own: string[] = []): FoundValue[] {
  const found: FoundValue[] = [];
  const readCategoryFile = (directory: string, file: Dirent, shownDirectory: string, database: FoundValue['database'], weaponClass: string | null) => {
    const here = `${shownDirectory}/${file.name}`;
    if (!file.isFile() || !file.name.endsWith('.json')) return void notRead.push(`${here}: not a .json file`);
    for (const [key, value] of Object.entries(readObject(join(directory, file.name), here) ?? {})) {
      found.push({ file: here, database, weaponClass, category: file.name.slice(0, -'.json'.length), key, value });
    }
  };
  for (const entry of list(path)) {
    const inner = join(path, entry.name), here = `${shown}/${entry.name}`;
    if (entry.isDirectory() && entry.name === 'Character') {
      for (const file of list(inner)) readCategoryFile(inner, file, here, 'Character', null);
    } else if (entry.isDirectory() && entry.name === 'Weapon') {
      for (const weapon of list(inner)) {
        const weaponPath = join(inner, weapon.name), weaponShown = `${here}/${weapon.name}`;
        if (!weapon.isDirectory()) notRead.push(`${weaponShown}: not a weapon class folder`);
        else for (const file of list(weaponPath)) readCategoryFile(weaponPath, file, weaponShown, 'Weapon', weapon.name);
      }
    } else if (!own.includes(entry.name)) {
      notRead.push(`${here}: not in Character/ or Weapon/`);
    }
  }
  return found;
}

const ATTACKS: readonly string[] = Object.values(WeaponConfigAttackName);
const WEAPON_CLASSES: readonly string[] = Object.values(CategoryName);
const GENERAL_KEYS = new Set(WEAPON_CONFIG_OPTIONS.General.map(entry => entry.configKey));
const ATTACK_KEYS = new Set(WEAPON_CONFIG_OPTIONS.Attack.map(entry => entry.configKey));

/** Where a value goes, by key name: its field in a values document and its key's current category (a weapon's attack for attack keys); or why it has none. */
function place({ database, weaponClass, category, key, value }: FoundValue): { field: DocumentField; home: string } | { reason: string } {
  if (database === 'Character') {
    const [field] = documentFields({ Character: { [key]: value } });
    return field.category ? { field, home: field.category } : { reason: 'Unknown config key' };
  }
  const weapon = weaponClass!;
  if (!WEAPON_CLASSES.includes(weapon)) return { reason: 'Unknown weapon class' };
  if (ATTACKS.includes(category)) {
    const [field] = documentFields({ Weapon: { [weapon]: { [category]: { [key]: value } } } });
    if (field.category) return { field, home: category };
  }
  const [field] = documentFields({ Weapon: { [weapon]: { [key]: value } } });
  if (field.category) return { field, home: 'General' };
  if (GENERAL_KEYS.has(key) || ATTACK_KEYS.has(key) && ATTACKS.includes(category)) return { reason: `${weapon} does not have this key` };
  if (ATTACK_KEYS.has(key)) return { reason: 'An attack key outside an attack file (Strike, AltStrike, Stab or AltStab.json)' };
  return { reason: 'Unknown config key' };
}

/** One folder's values as a values document: each once, under its key's current category, and only what a Draft save accepts. */
function resolveValues(found: FoundValue[]): Values {
  const dropped: DroppedValue[] = [];
  const drop = ({ file, database, weaponClass, key }: FoundValue, reason: string) => dropped.push({ file, database, weaponClass, key, reason });
  const byPath = new Map<string, (FoundValue & { field: DocumentField; home: string })[]>();
  for (const value of found) {
    const placed = place(value);
    if ('reason' in placed) drop(value, placed.reason);
    else {
      const path = JSON.stringify(placed.field.path);
      byPath.set(path, [...byPath.get(path) ?? [], { ...value, ...placed }]);
    }
  }
  const document: ValuesDocument = {};
  let count = 0;
  for (const copies of byPath.values()) {
    let kept = copies;
    if (copies.some(copy => !isDeepStrictEqual(copy.value, copies[0].value))) {
      // The file of the key's current category wins; when no copy is in it, none does.
      const home = copies.find(copy => copy.category === copy.home);
      for (const copy of copies) {
        if (copy !== home) drop(copy, home ? `Differs from ${home.file}, the file of its current category` : `Differs between files, and none is ${copy.home}.json, its current category`);
      }
      if (!home) continue;
      kept = [home];
    }
    const error = fieldError(kept[0].field);
    if (error) {
      for (const copy of kept) drop(copy, error);
      continue;
    }
    addField(document, kept[0].field.path, kept[0].value);
    count++;
  }
  // By file, for the report; sort is stable.
  return { document, count, dropped: dropped.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)) };
}

/** Each preset to import, as a Ruleset; a name or description the platform would refuse is a problem. */
function readPresets(path: string): NewRuleset[] {
  const rulesets: NewRuleset[] = [];
  const groups = list(path).filter(group => {
    const known = group.isDirectory() && (group.name === 'User' || group.name === 'Static');
    if (!known) notRead.push(`Presets/${group.name}: not User/ or Static/`);
    return known;
  });
  // User presets first, then Static.
  for (const group of groups.sort((a, b) => Number(a.name !== 'User') - Number(b.name !== 'User'))) {
    const groupShown = `Presets/${group.name}`;
    for (const entry of list(join(path, group.name))) {
      const folder = join(path, group.name, entry.name), shown = `${groupShown}/${entry.name}`;
      if (group.name === 'Static' && entry.name === 'GameDefault') {
        notRead.push(`${shown}: the built-in preset`);
        continue;
      }
      if (!entry.isDirectory()) {
        notRead.push(`${shown}: not a preset folder`);
        continue;
      }
      const manifest = existsSync(join(folder, 'manifest.json')) ? readObject(join(folder, 'manifest.json'), `${shown}/manifest.json`) : undefined;
      const title = typeof manifest?.title === 'string' ? manifest.title.trim() : '';
      const name = readRulesetName(title || entry.name);
      if (!name.ok) problems.push(`${shown}: its ${title ? 'manifest title' : 'folder name'} cannot be a Ruleset name: ${name.error}. Edit the copied manifest's title.`);
      const description = readDescription(typeof manifest?.description === 'string' ? manifest.description : undefined);
      if (!description.ok) problems.push(`${shown}/manifest.json: its description cannot be a version description: ${description.error}. Edit the copied manifest.`);
      const values = resolveValues(readConfigurationFolder(folder, shown, ['manifest.json']));
      if (name.ok) {
        rulesets.push({
          name: name.name, nameKey: name.nameKey, source: `${shown} (${title ? 'manifest title' : 'folder name'})`,
          description: description.ok ? description.description : null, values,
        });
      }
    }
  }
  return rulesets;
}

/** Every Note in the two schema files, in file order: character.json, then weapon.json. */
function readNotes(path: string): { notes: FoundNote[]; dropped: DroppedNote[] } {
  const notes: FoundNote[] = [], dropped: DroppedNote[] = [];
  for (const entry of list(path)) {
    const shown = `Notes/${entry.name}`;
    const database: NoteDatabase | undefined = entry.name === 'character.json' ? 'Character' : entry.name === 'weapon.json' ? 'Weapon' : undefined;
    if (!database || !entry.isFile()) {
      notRead.push(`${shown}: not character.json or weapon.json`);
      continue;
    }
    for (const [key, items] of Object.entries(readObject(join(path, entry.name), shown) ?? {})) {
      if (!Array.isArray(items)) {
        dropped.push({ file: shown, key, position: null, reason: 'not a list of Notes' });
        continue;
      }
      items.forEach((item: unknown, index) => {
        const position = index + 1;
        if (!isObject(item) || typeof item.note !== 'string') return void dropped.push({ file: shown, key, position, reason: 'it has no body' });
        const body = sanitizeNoteBody(item.note);
        if (!hasNoteText(body)) return void dropped.push({ file: shown, key, position, reason: 'no text is left once sanitized' });
        notes.push({ file: shown, database, key, position, createdBy: typeof item.createdBy === 'string' ? item.createdBy : null, original: item.note, body });
      });
    }
  }
  return { notes, dropped };
}

/** Two of the import's names that compare equal, ignoring case. */
function collisions(rulesets: NewRuleset[]): string[] {
  const byKey = new Map<string, NewRuleset[]>();
  for (const ruleset of rulesets) byKey.set(ruleset.nameKey, [...byKey.get(ruleset.nameKey) ?? [], ruleset]);
  return [...byKey.values()].filter(same => same.length > 1).map(same =>
    `${same.length} Rulesets would be called ${quoted(same[0].name)} (names ignore case): ${same.map(ruleset => `${quoted(ruleset.name)} from ${ruleset.source}`).join(', ')}. Edit a copied manifest's title${same.some(ruleset => ruleset.source.startsWith('Databases')) ? ' or pass another --ruleset-name' : ''}.`);
}

/** The server owners other than the importer that Notes go to, by old username. */
type NoteAuthors = Map<string, { id: number; username: string }>;
interface Target { ownerId: number; ownerName: string; gameServer?: { id: number; name: string } }

/**
 * What the platform must hold for the import: the owner, each --note-author,
 * none of the names, and none of the Notes (a run after its game server and
 * Rulesets were deleted would add them twice). With a game server named: that
 * server, a Draft never saved, and no Live configuration.
 */
function checkPlatform(discordId: string, gameServer: { name: string; nameKey: string } | null, rulesets: NewRuleset[], notes: FoundNote[], noteAuthorIds: Map<string, string>): { target?: Target; authors: NoteAuthors; problems: string[] } {
  const store = platformStore();
  const found: string[] = [];
  const stored = new Set(store.all<{ database_name: string; key_name: string; body: string }>('SELECT database_name, key_name, body FROM notes')
    .map(row => JSON.stringify([row.database_name, row.key_name, row.body])));
  const again = notes.filter(note => stored.has(JSON.stringify([note.database, note.key, note.body]))).length;
  if (again) found.push(`${again} of the Notes to import are already on the platform, on the same key with the same body, as if the import ran before. Delete them there first, or leave them out of the copied Notes/.`);
  const authors: NoteAuthors = new Map();
  for (const [oldName, id] of noteAuthorIds) {
    const author = findServerOwnerByDiscordId(id);
    if (author) authors.set(oldName, { id: author.id, username: author.username });
    else found.push(`No server owner has Discord id ${id}, named for Notes by ${quoted(oldName)}: that account must sign in to the platform first.`);
  }
  const owner = findServerOwnerByDiscordId(discordId);
  if (!owner) return { authors, problems: [...found, `No server owner has Discord id ${discordId}: sign in to the platform with that account first.`] };
  const server = gameServer && store.get<{ id: number; name: string }>('SELECT id, name FROM game_servers WHERE owner_id = ? AND name_key = ?', owner.id, gameServer.nameKey);
  if (gameServer && !server) {
    found.push(`${owner.username} has no game server called ${quoted(gameServer.name)}: register it on the platform first.`);
  } else if (server) {
    const draft = readDraft(server.id)!;
    if (draft.revision > 0 || draft.savedAt !== null) {
      found.push(`The Draft of ${quoted(server.name)} was saved (revision ${draft.revision}), and the import fills only a Draft never saved. Delete that game server, register it again and import before opening its Draft.`);
    }
    if (readLiveConfiguration(server.id)) found.push(`${quoted(server.name)} has a Live configuration; the import is for a game server never applied to.`);
  }
  for (const ruleset of rulesets) {
    const taken = store.get<{ name: string }>('SELECT name FROM rulesets WHERE owner_id = ? AND name_key = ?', owner.id, ruleset.nameKey);
    if (taken) found.push(`${owner.username} already has a Ruleset called ${quoted(taken.name)}, the name ${ruleset.source} would take.`);
  }
  return { target: { ownerId: owner.id, ownerName: owner.username, gameServer: server ?? undefined }, authors, problems: found };
}

/** Writes the whole import in one transaction, checking the platform again inside it. */
function write(discordId: string, gameServer: { name: string; nameKey: string } | null, rulesets: NewRuleset[], notes: FoundNote[], oldUsernames: string[], noteAuthorIds: Map<string, string>, now: number) {
  const store = platformStore();
  store.transaction(() => {
    const check = checkPlatform(discordId, gameServer, rulesets, notes, noteAuthorIds);
    if (check.problems.length) throw new Refused(check.problems);
    const { ownerId, gameServer: server } = check.target!;
    const versions = rulesets.map(ruleset => {
      const { id } = store.get<{ id: number }>('INSERT INTO rulesets (owner_id, name, name_key, created_at) VALUES (?, ?, ?, ?) RETURNING id', ownerId, ruleset.name, ruleset.nameKey, now)!;
      return store.get<{ id: number }>(
        'INSERT INTO ruleset_versions (ruleset_id, number, description, overrides, saved_at) VALUES (?, 1, ?, ?, ?) RETURNING id',
        id, ruleset.description, JSON.stringify(ruleset.values.document), now,
      )!.id;
    });
    // The first Ruleset is Databases', "Self-hosted": the Draft gets its values and it as the origin.
    if (server) {
      const draft = loadDraft(server.id, 0, { document: rulesets[0].values.document, originId: versions[0] }, now);
      if (!draft?.ok) throw new Error('The Draft moved on inside the import transaction');
    }
    for (const note of notes) {
      const authorId = note.createdBy === null ? null : oldUsernames.includes(note.createdBy) ? ownerId : check.authors.get(note.createdBy)?.id ?? null;
      store.run('INSERT INTO notes (database_name, key_name, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
        note.database, note.key, authorId, note.body, now);
    }
  });
}

const valuesLabel = (count: number) => `${count} value${count === 1 ? '' : 's'}`;
const cut = (text: string) => ([...text].length > 200 ? `${[...text].slice(0, 200).join('')}…` : text);

function report(lines: string[], { gameServerName, rulesets, notes, droppedNotes, oldUsernames, noteAuthorIds, authors }: {
  gameServerName: string | null; rulesets: NewRuleset[]; notes: FoundNote[]; droppedNotes: DroppedNote[]; oldUsernames: string[]; noteAuthorIds: Map<string, string>; authors: NoteAuthors;
}) {
  lines.push('', 'Destinations');
  if (gameServerName !== null) {
    const [selfHosted] = rulesets;
    lines.push(`  Draft of game server ${quoted(gameServerName)}: ${valuesLabel(selfHosted.values.count)}, origin ${quoted(selfHosted.name)} version 1. No Live configuration until you review it and Apply.`);
  }
  for (const ruleset of rulesets) {
    const dropped = ruleset.values.dropped.length;
    lines.push(`  Ruleset ${quoted(ruleset.name)} version 1: ${valuesLabel(ruleset.values.count)}${dropped ? ` (${dropped} dropped)` : ''}, from ${ruleset.source}${ruleset.description ? `, description ${quoted(cut(ruleset.description))}` : ''}`);
  }
  const dropped = rulesets.flatMap(ruleset => ruleset.values.dropped);
  lines.push('', `Dropped values: ${dropped.length}`);
  for (const value of dropped) {
    lines.push(`  ${[value.database, value.weaponClass, value.key].filter(part => part !== null).join(' / ')} in ${value.file}: ${value.reason}`);
  }
  lines.push('', `Not read: ${notRead.length}`, ...notRead.map(entry => `  ${entry}`));

  const by = (name: string) => notes.filter(note => note.createdBy === name).length;
  const others = new Map<string, number>();
  for (const note of notes) {
    if (note.createdBy !== null && (oldUsernames.includes(note.createdBy) || noteAuthorIds.has(note.createdBy))) continue;
    others.set(note.createdBy ?? '', (others.get(note.createdBy ?? '') ?? 0) + 1);
  }
  const hidden = new Map<string, number>();
  for (const note of notes) if (!isNoteKey(note.database, note.key)) hidden.set(`${note.database} / ${note.key}`, (hidden.get(`${note.database} / ${note.key}`) ?? 0) + 1);
  const changed = notes.filter(note => note.body !== note.original);
  lines.push('', `Notes: ${notes.length}`);
  lines.push(`  Yours (by old username ${oldUsernames.map(quoted).join(', ')}): ${oldUsernames.reduce((sum, name) => sum + by(name), 0)}`);
  for (const [oldName, id] of noteAuthorIds) lines.push(`  ${authors.get(oldName)?.username ?? 'No server owner yet'} (by old username ${quoted(oldName)}, Discord id ${id}): ${by(oldName)}`);
  lines.push(`  With no author ("a former server owner"): ${[...others.values()].reduce((sum, count) => sum + count, 0)}${others.size ? ` (${[...others].map(([name, count]) => `${name ? `by ${quoted(name)}` : 'by no one recorded'}: ${count}`).join(', ')})` : ''}`);
  lines.push(`  On keys the schema lacks, imported and hidden: ${[...hidden.values()].reduce((sum, count) => sum + count, 0)}`, ...[...hidden].map(([key, count]) => `    ${key}: ${count}`));
  lines.push(`  Bodies the sanitizer changed: ${changed.length}`);
  for (const note of changed) {
    lines.push(`    ${note.file} ${note.key}, Note ${note.position}${note.createdBy !== null ? ` by ${quoted(note.createdBy)}` : ''}`, `      before: ${cut(note.original)}`, `      after:  ${cut(note.body)}`);
  }
  lines.push(`  Dropped: ${droppedNotes.length}`, ...droppedNotes.map(note => `    ${note.file} ${note.key}${note.position ? `, Note ${note.position}` : ''}: ${note.reason}`));
}

function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        databases: { type: 'string' }, presets: { type: 'string' }, notes: { type: 'string' },
        'discord-id': { type: 'string' }, 'game-server': { type: 'string' }, 'old-username': { type: 'string', multiple: true }, 'note-author': { type: 'string', multiple: true },
        'ruleset-name': { type: 'string', default: 'Self-hosted' }, commit: { type: 'boolean', default: false },
      },
    }).values;
  } catch (error) {
    stop(`${(error as Error).message}\n${USAGE}`, 2);
  }
  const oldUsernames = args['old-username'] ?? [];
  const missing = [
    ...(['presets', 'notes', 'discord-id'] as const).filter(name => !args[name]),
    ...(!oldUsernames.length || oldUsernames.includes('') ? ['old-username'] : []),
  ];
  if (missing.length) stop(`Missing ${missing.map(name => `--${name}`).join(', ')}\n${USAGE}`, 2);
  if (!args.databases !== !args['game-server']) stop(`--databases and --game-server go together: both to fill a Draft, neither for only the Rulesets and Notes.\n${USAGE}`, 2);
  for (const name of ['databases', 'presets', 'notes'] as const) {
    const path = args[name];
    if (path && (!existsSync(path) || !statSync(path).isDirectory())) stop(`--${name}: no folder at ${path}`, 2);
  }
  const noteAuthorIds = new Map<string, string>();
  for (const entry of args['note-author'] ?? []) {
    const split = entry.lastIndexOf('=');
    const oldName = entry.slice(0, Math.max(split, 0)), id = entry.slice(split + 1);
    if (!oldName || !/^\d{1,20}$/.test(id)) stop(`--note-author ${entry}: use <old username>=<Discord id>\n${USAGE}`, 2);
    if (oldUsernames.includes(oldName) || noteAuthorIds.has(oldName)) stop(`--note-author ${entry}: ${quoted(oldName)} has an author already\n${USAGE}`, 2);
    noteAuthorIds.set(oldName, id);
  }
  const selfHostedName = readRulesetName(args['ruleset-name']);
  if (!selfHostedName.ok) stop(`--ruleset-name: ${selfHostedName.error}`, 2);
  const gameServer = args['game-server'] ? readGameServerName(args['game-server']) : null;
  if (gameServer && !gameServer.ok) stop(`--game-server: ${gameServer.error}`, 2);
  const discordId = args['discord-id']!, commit = args.commit!;

  // The app creates and migrates the database at startup; the import never does either.
  const databasePath = process.env.DATABASE_PATH;
  if (!databasePath) stop(`Set DATABASE_PATH to the platform database.\n${USAGE}`, 2);
  if (!existsSync(databasePath)) stop(`No platform database at ${databasePath}: start the app once, which creates it.`, 1);
  const expected = readPlatformMigrations(join(import.meta.dir, '..', 'src', 'lib', 'platform', 'migrations')).length;
  const { user_version: version } = platformStore().get<{ user_version: number }>('PRAGMA user_version')!;
  if (version !== expected) stop(`The platform database is at version ${version} and this release expects ${expected}: run the import from the release the app runs, after it has started.`, 1);

  const now = Date.now();
  const rulesets: NewRuleset[] = [
    ...(args.databases ? [{ name: selfHostedName.name, nameKey: selfHostedName.nameKey, source: 'Databases (--ruleset-name)', description: null, values: resolveValues(readConfigurationFolder(args.databases, 'Databases')) }] : []),
    ...readPresets(args.presets!),
  ];
  const { notes, dropped: droppedNotes } = readNotes(args.notes!);
  problems.push(...collisions(rulesets));
  const check = checkPlatform(discordId, gameServer, rulesets, notes, noteAuthorIds);
  problems.push(...check.problems);

  let written = false;
  if (commit && !problems.length) {
    try {
      write(discordId, gameServer, rulesets, notes, oldUsernames, noteAuthorIds, now);
      written = true;
    } catch (error) {
      if (!(error instanceof Refused)) throw error;
      problems.push(...error.problems);
    }
  }

  const lines = [`EZConfig one-time import${commit ? '' : ': dry run, nothing is written'}`];
  if (check.target) lines.push(`Server owner: ${check.target.ownerName} (Discord id ${discordId})`);
  report(lines, { gameServerName: gameServer && (check.target?.gameServer?.name ?? gameServer.name), rulesets, notes, droppedNotes, oldUsernames, noteAuthorIds, authors: check.authors });
  if (problems.length) {
    lines.push('', `Refused, so nothing was written: ${problems.length}`, ...problems.map(problem => `  - ${problem}`));
  } else if (written) {
    lines.push('', gameServer
      ? `Imported: the Draft, ${rulesets.length} Rulesets and ${notes.length} Notes. Nothing reaches the game server until you review its Draft and Apply.`
      : `Imported: ${rulesets.length} Rulesets and ${notes.length} Notes. No game server was touched.`);
  } else {
    lines.push('', 'Dry run passed. Run again with --commit to import.');
  }
  console.log(lines.join('\n'));
  return problems.length ? 1 : 0;
}

if (import.meta.main) {
  let exitCode: number;
  try {
    exitCode = main();
  } finally {
    closePlatformStore();
  }
  process.exit(exitCode);
}
