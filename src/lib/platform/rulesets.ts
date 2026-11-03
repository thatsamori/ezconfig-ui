/**
 * Rulesets (online-platform#35): a server owner's saved configurations, each a
 * named collection of immutable, numbered Ruleset versions. Rulesets belong to
 * their owner and stay private on the platform: another owner's reads as
 * missing. The only way one leaves is a Ruleset file the owner exports.
 *
 * - Save as Ruleset version copies the Draft's values document, as stored,
 *   into version 1 of a new Ruleset or the next version (highest + 1) of one
 *   of the owner's. The new version becomes the Draft's origin. It is a Draft
 *   write, so the revision it was based on is checked first (drafts.ts), and
 *   it never applies anything.
 * - Loading a version copies its values over the whole Draft and makes it the
 *   origin, revision checked. Only the values the current schema has a place
 *   for are loaded, under their keys' current categories; the rest are
 *   dropped and counted. A value the schema refuses is loaded and listed:
 *   Apply blocks on it until the owner fixes it. Nothing goes live until Apply.
 * - Names are unique per owner, ignoring case, as game server names are. A
 *   Ruleset can be renamed. Deleting one deletes its versions and clears every
 *   origin that pointed into them, Drafts and Live configurations alike, in
 *   one transaction (0009); the values stay. A single version is never deleted.
 * - Exporting a version writes it as a Ruleset file (rulesetFile.ts). Importing
 *   a file makes version 1 of a new Ruleset, in one transaction, and touches no
 *   Draft, Live configuration or game server. The file is input from outside:
 *   its name and description are checked as any others are, and a value with no
 *   place in the schema, or one a Draft save would refuse, is dropped and
 *   reported, so one dropped value never fails the import. A round trip of
 *   values a save accepts loads the same Draft as the original.
 *
 * Nothing here logs: the routes log each change, by id only.
 */
import { readRulesetFile, writeRulesetFile } from '@/lib/config/rulesetFile';
import { acceptedValues, documentErrors, knownValues, type FieldError, type ValuesDocument } from '@/lib/config/valuesDocument';
import { loadDraft, readDraft, setDraftOrigin, type Draft } from './drafts';
import { readGameServerName, type NameCheck } from './game-servers';
import { platformStore } from './storage';

export const DESCRIPTION_MAX = 500;
/** How many dropped values an import's review lists, and how long each part of one may be: a file can hold any number, of any length. */
const DROPPED_LISTED = 100;
const DROPPED_TEXT_MAX = 200;

export interface RulesetVersionSummary {
  id: number;
  number: number;
  description: string | null;
  savedAt: number;
}

/** What the owner's pages list of a Ruleset: never its values. */
export interface RulesetSummary {
  id: number;
  name: string;
  createdAt: number;
  /** Newest first. */
  versions: RulesetVersionSummary[];
}

/** Where Save as Ruleset version puts the Draft: the next version of one of the owner's Rulesets, or version 1 of a new one. */
export type VersionTarget = { rulesetId: number } | { name: string; nameKey: string };

export type SaveVersionResult =
  | { ok: true; ruleset: { id: number; name: string }; version: RulesetVersionSummary; draft: Draft }
  | { ok: false; reason: 'stale'; draft: Draft }
  | { ok: false; reason: 'name-taken'; takenBy: string }
  | { ok: false; reason: 'no-ruleset' };

export type LoadVersionResult =
  | { ok: true; draft: Draft; dropped: number; errors: FieldError[] }
  | { ok: false; reason: 'stale'; draft: Draft }
  | { ok: false; reason: 'no-version' };

export type RenameResult = { ok: true; ruleset: { id: number; name: string } } | { ok: false; takenBy: string };

/** A Ruleset file, read and checked, ready to review or import. */
export interface RulesetImport {
  name: string;
  nameKey: string;
  description: string | null;
  document: ValuesDocument;
  values: number;
  dropped: FieldError[];
}

/** What the owner sees of a file before importing it. */
export interface ImportReview {
  name: string;
  description: string | null;
  /** The owner's Ruleset that already has the name, ignoring case; null when it is free. */
  takenBy: string | null;
  values: number;
  /** How many values are dropped; `droppedValues` lists the first of them, cut to length. */
  dropped: number;
  droppedValues: FieldError[];
}

export type ImportResult =
  | { ok: true; ruleset: { id: number; name: string }; version: RulesetVersionSummary }
  | { ok: false; takenBy: string };

type RulesetRow = { id: number; name: string; created_at: number };
type VersionRow = { id: number; ruleset_id: number; number: number; description: string | null; saved_at: number };
const version = (row: VersionRow): RulesetVersionSummary => ({ id: row.id, number: row.number, description: row.description, savedAt: row.saved_at });

/** A Ruleset name as given, trimmed: the same rules as a game server name. */
export function readRulesetName(value: unknown): NameCheck {
  const name = readGameServerName(value);
  return name.ok || typeof value === 'string' && value.trim() ? name : { ok: false, error: 'Give the Ruleset a name' };
}

/** An optional version description, trimmed; empty or missing is none. */
export function readDescription(value: unknown): { ok: true; description: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, description: null };
  if (typeof value !== 'string') return { ok: false, error: 'The description must be text' };
  const description = value.replace(/\r\n?/g, '\n').trim().normalize('NFC');
  if ([...description].length > DESCRIPTION_MAX) return { ok: false, error: `Keep the description to ${DESCRIPTION_MAX} characters or fewer` };
  // Line breaks and tabs are text; other control characters are not.
  if (/[^\P{Cc}\n\t]/u.test(description)) return { ok: false, error: 'The description cannot contain control characters' };
  return { ok: true, description: description || null };
}

/** An id as a route was given it; undefined when it cannot be one. */
export const readId = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value
    : typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : undefined;

const ownedRuleset = (ownerId: number, id: number) => platformStore().get<RulesetRow>('SELECT id, name, created_at FROM rulesets WHERE id = ? AND owner_id = ?', id, ownerId);
const nameHolder = (ownerId: number, nameKey: string) => platformStore().get<{ name: string }>('SELECT name FROM rulesets WHERE owner_id = ? AND name_key = ?', ownerId, nameKey);
const insertRuleset = (ownerId: number, name: string, nameKey: string, now: number) =>
  platformStore().get<RulesetRow>('INSERT INTO rulesets (owner_id, name, name_key, created_at) VALUES (?, ?, ?, ?) RETURNING id, name, created_at', ownerId, name, nameKey, now)!;

/** The owner's Rulesets by name, each with its versions, newest first. */
export function listRulesets(ownerId: number): RulesetSummary[] {
  const store = platformStore();
  const rulesets = store.all<RulesetRow>('SELECT id, name, created_at FROM rulesets WHERE owner_id = ? ORDER BY name_key, id', ownerId);
  const versions = store.all<VersionRow>(
    'SELECT ruleset_versions.id, ruleset_id, number, description, saved_at FROM ruleset_versions JOIN rulesets ON rulesets.id = ruleset_id WHERE owner_id = ? ORDER BY number DESC',
    ownerId,
  );
  return rulesets.map(row => ({ id: row.id, name: row.name, createdAt: row.created_at, versions: versions.filter(entry => entry.ruleset_id === row.id).map(version) }));
}

/**
 * Save as Ruleset version: the Draft's values become version 1 of a new
 * Ruleset or the next version of one of the owner's, and that version the
 * Draft's origin, if the Draft is still at `baseRevision`. Nothing is created
 * on any refusal. Undefined when the game server has no Draft.
 */
export function saveRulesetVersion(ownerId: number, gameServerId: number, baseRevision: number, target: VersionTarget, description: string | null, now = Date.now()): SaveVersionResult | undefined {
  const store = platformStore();
  return store.transaction((): SaveVersionResult | undefined => {
    const current = readDraft(gameServerId);
    if (!current) return undefined;
    if (current.revision !== baseRevision) return { ok: false, reason: 'stale', draft: current };
    let ruleset: RulesetRow | undefined;
    if ('rulesetId' in target) {
      ruleset = ownedRuleset(ownerId, target.rulesetId);
      if (!ruleset) return { ok: false, reason: 'no-ruleset' };
    } else {
      const taken = nameHolder(ownerId, target.nameKey);
      if (taken) return { ok: false, reason: 'name-taken', takenBy: taken.name };
      ruleset = insertRuleset(ownerId, target.name, target.nameKey, now);
    }
    const saved = store.get<VersionRow>(
      `INSERT INTO ruleset_versions (ruleset_id, number, description, overrides, saved_at)
       VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM ruleset_versions WHERE ruleset_id = ?), ?, ?, ?)
       RETURNING id, ruleset_id, number, description, saved_at`,
      ruleset.id, ruleset.id, description, JSON.stringify(current.document), now,
    )!;
    // The revision was checked above, in this transaction, so the origin's write cannot be refused.
    const written = setDraftOrigin(gameServerId, baseRevision, saved.id, now);
    if (!written?.ok) throw new Error('The Draft moved on inside its own transaction');
    return { ok: true, ruleset: { id: ruleset.id, name: ruleset.name }, version: version(saved), draft: written.draft };
  });
}

/**
 * Loads one of the owner's Ruleset versions over the whole Draft, if it is
 * still at `baseRevision`: the values the current schema has a place for, with
 * the version as the origin. `dropped` counts the values left out; `errors`
 * lists the loaded values the schema refuses. Undefined when the game server
 * has no Draft.
 */
export function loadRulesetVersion(ownerId: number, gameServerId: number, baseRevision: number, versionId: number, now = Date.now()): LoadVersionResult | undefined {
  const store = platformStore();
  return store.transaction((): LoadVersionResult | undefined => {
    const row = store.get<{ overrides: string }>(
      'SELECT overrides FROM ruleset_versions WHERE id = ? AND ruleset_id IN (SELECT id FROM rulesets WHERE owner_id = ?)', versionId, ownerId,
    );
    if (!row) return readDraft(gameServerId) && { ok: false, reason: 'no-version' };
    const { document, dropped } = knownValues(JSON.parse(row.overrides));
    const written = loadDraft(gameServerId, baseRevision, { document, originId: versionId }, now);
    if (!written?.ok) return written;
    return { ok: true, draft: written.draft, dropped, errors: documentErrors(document) };
  });
}

/** Renames one of the owner's Rulesets; another of theirs may not have the name, ignoring case. Undefined when it is not theirs. */
export function renameRuleset(ownerId: number, id: number, { name, nameKey }: { name: string; nameKey: string }): RenameResult | undefined {
  const store = platformStore();
  return store.transaction((): RenameResult | undefined => {
    if (!ownedRuleset(ownerId, id)) return undefined;
    const taken = store.get<{ name: string }>('SELECT name FROM rulesets WHERE owner_id = ? AND name_key = ? AND id != ?', ownerId, nameKey, id);
    if (taken) return { ok: false, takenBy: taken.name };
    store.run('UPDATE rulesets SET name = ?, name_key = ? WHERE id = ?', name, nameKey, id);
    return { ok: true, ruleset: { id, name } };
  });
}

/** One of the owner's Ruleset versions as a Ruleset file, with its values as stored. Undefined when it is not theirs, or not in that Ruleset. */
export function exportRulesetVersion(ownerId: number, rulesetId: number, versionId: number): { name: string; number: number; text: string } | undefined {
  const row = platformStore().get<{ name: string; number: number; description: string | null; overrides: string }>(
    'SELECT name, number, description, overrides FROM ruleset_versions JOIN rulesets ON rulesets.id = ruleset_id WHERE ruleset_versions.id = ? AND ruleset_id = ? AND owner_id = ?',
    versionId, rulesetId, ownerId,
  );
  return row && { name: row.name, number: row.number, text: writeRulesetFile({ name: row.name, description: row.description, values: JSON.parse(row.overrides) }) };
}

/**
 * Reads a Ruleset file for importing. `name`, when given, is the name the owner
 * chose instead of the file's. Refused when the file is not the format, or its
 * name or description are ones the platform would refuse. Values are never a
 * reason to refuse: the ones a save would not accept are dropped and listed.
 */
export function readRulesetImport(text: string, name?: unknown): { ok: true; ruleset: RulesetImport } | { ok: false; error: string } {
  const file = readRulesetFile(text);
  if (!file.ok) return file;
  const fileName = readRulesetName(file.name);
  if (!fileName.ok) return { ok: false, error: `This Ruleset file's name cannot be used: ${fileName.error}` };
  const description = readDescription(file.description);
  if (!description.ok) return { ok: false, error: `This Ruleset file's description cannot be used: ${description.error}` };
  const chosen = name === undefined ? fileName : readRulesetName(name);
  if (!chosen.ok) return chosen;
  return { ok: true, ruleset: { name: chosen.name, nameKey: chosen.nameKey, description: description.description, ...acceptedValues(file.values) } };
}

const cutDropped = (text: string) => (text.length > DROPPED_TEXT_MAX ? `${[...text].slice(0, DROPPED_TEXT_MAX).join('')}…` : text);

/** What the owner sees before importing: nothing is written. */
export function reviewRulesetImport(ownerId: number, ruleset: RulesetImport): ImportReview {
  return {
    name: ruleset.name,
    description: ruleset.description,
    takenBy: nameHolder(ownerId, ruleset.nameKey)?.name ?? null,
    values: ruleset.values,
    dropped: ruleset.dropped.length,
    droppedValues: ruleset.dropped.slice(0, DROPPED_LISTED).map(({ database, category, key, error }) => ({ database: cutDropped(database), category, key: cutDropped(key), error: cutDropped(error) })),
  };
}

/** Makes version 1 of a new Ruleset of the owner's from a read file, in one transaction, unless another of theirs has the name, ignoring case. */
export function importRuleset(ownerId: number, ruleset: RulesetImport, now = Date.now()): ImportResult {
  const store = platformStore();
  return store.transaction((): ImportResult => {
    const taken = nameHolder(ownerId, ruleset.nameKey);
    if (taken) return { ok: false, takenBy: taken.name };
    const created = insertRuleset(ownerId, ruleset.name, ruleset.nameKey, now);
    const saved = store.get<VersionRow>(
      'INSERT INTO ruleset_versions (ruleset_id, number, description, overrides, saved_at) VALUES (?, 1, ?, ?, ?) RETURNING id, ruleset_id, number, description, saved_at',
      created.id, ruleset.description, JSON.stringify(ruleset.document), now,
    )!;
    return { ok: true, ruleset: { id: created.id, name: created.name }, version: version(saved) };
  });
}

/**
 * Deletes one of the owner's Rulesets with all its versions. Every Draft and
 * Live configuration whose origin was one of them keeps its values and has no
 * origin from then on (0009's ON DELETE SET NULL, in the same statement).
 * Undefined when it is not theirs.
 */
export function deleteRuleset(ownerId: number, id: number): { versions: number } | undefined {
  const store = platformStore();
  return store.transaction(() => {
    if (!ownedRuleset(ownerId, id)) return undefined;
    const { versions } = store.get<{ versions: number }>('SELECT COUNT(*) AS versions FROM ruleset_versions WHERE ruleset_id = ?', id)!;
    store.run('DELETE FROM rulesets WHERE id = ?', id);
    return { versions };
  });
}
