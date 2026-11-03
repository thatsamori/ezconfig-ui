/**
 * Drafts (online-platform#30): a game server's auto-saved working
 * configuration, one values document (src/lib/config/valuesDocument.ts) in
 * the `drafts` row its registration made, with a revision every write raises.
 *
 * - A save sends the whole document with the revision it was based on. Every
 *   value is checked against the current schema, camera policy included, and
 *   a value it refuses refuses the save: nothing is written.
 * - Values the schema has no place for (a retired key or weapon class) are
 *   kept as stored. The editor never shows them, so a save never removes them.
 * - A value equal to its game default is kept as an override; a key the
 *   editor resets is simply not in the document.
 * - Every write names the revision it was based on and goes through `write`,
 *   which refuses it with the current Draft when the Draft has moved on
 *   (online-platform#31). A route answers that with `staleDraft`. Discard
 *   changes (#32) and the Ruleset writes (#35) join here the same way.
 * - Reset to game defaults empties the document. It will also clear the
 *   Draft's origin once Rulesets (#35) give it one.
 * - Discard changes (#32, through live-configurations.ts) makes the document
 *   the Live configuration's. It will also copy its origin (#35).
 */
import { addField, documentErrors, documentFields, placeValues, type EditorValues, type FieldError, type ValuesDocument } from '@/lib/config/valuesDocument';
import { platformStore } from './storage';

export interface Draft {
  gameServerId: number;
  document: ValuesDocument;
  revision: number;
  savedAt: number | null;
}

/** What the editor loads: the values placed under their keys' current categories, and how many stored values it cannot show. */
export interface DraftView {
  values: EditorValues;
  dropped: number;
  revision: number;
  savedAt: number | null;
}

export type DraftWrite =
  | { ok: true; draft: Draft }
  | { ok: false; reason: 'invalid'; errors: FieldError[] }
  | { ok: false; reason: 'stale'; draft: Draft };
/** A write with no values to check: written, or refused as stale. */
type CheckedWrite = Exclude<DraftWrite, { reason: 'invalid' }>;

type Row = { game_server_id: number; overrides: string; revision: number; saved_at: number | null };
const COLUMNS = 'game_server_id, overrides, revision, saved_at';
const draft = (row: Row): Draft => ({ gameServerId: row.game_server_id, document: JSON.parse(row.overrides), revision: row.revision, savedAt: row.saved_at });

/** A revision as a request sends it. */
export const readRevision = (value: unknown): number | undefined => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;

export function readDraft(gameServerId: number): Draft | undefined {
  const row = platformStore().get<Row>(`SELECT ${COLUMNS} FROM drafts WHERE game_server_id = ?`, gameServerId);
  return row && draft(row);
}

/** The Draft of one of the owner's game servers, by the id a route was given; another owner's reads as missing. */
export function findOwnedDraft(ownerId: number, id: string): Draft | undefined {
  // Read here rather than through game-servers.ts, whose page view reads Drafts (live-configurations.ts).
  if (!/^[1-9]\d{0,15}$/.test(id)) return undefined;
  const row = platformStore().get<Row>(
    `SELECT ${COLUMNS} FROM drafts WHERE game_server_id = (SELECT id FROM game_servers WHERE id = ? AND owner_id = ?)`, Number(id), ownerId,
  );
  return row && draft(row);
}

export function draftView({ document, revision, savedAt }: Draft): DraftView {
  return { ...placeValues(document), revision, savedAt };
}

/** A route's 409 body for a stale write: the current Draft, which the tab takes in place of its own. */
export const staleDraft = (current: Draft) => ({ success: false as const, error: 'The Draft changed since this page loaded it', data: draftView(current) });

/** The revision check every Draft write goes through: writes `next(current)` if the Draft is still at `baseRevision`; undefined when the game server has no Draft. */
function write(gameServerId: number, baseRevision: number, next: (current: Draft) => ValuesDocument, now: number): CheckedWrite | undefined {
  const store = platformStore();
  return store.transaction((): CheckedWrite | undefined => {
    const current = readDraft(gameServerId);
    if (!current) return undefined;
    if (current.revision !== baseRevision) return { ok: false, reason: 'stale', draft: current };
    const row = store.get<Row>(
      `UPDATE drafts SET overrides = ?, revision = revision + 1, saved_at = ? WHERE game_server_id = ? RETURNING ${COLUMNS}`,
      JSON.stringify(next(current)), now, gameServerId,
    )!;
    return { ok: true, draft: draft(row) };
  });
}

/** Auto-save: the whole document, checked value by value; the stored values the schema has no place for are kept. */
export function saveDraft(gameServerId: number, baseRevision: number, document: ValuesDocument, now = Date.now()): DraftWrite | undefined {
  const errors = documentErrors(document);
  if (errors.length) return { ok: false, reason: 'invalid', errors };
  return write(gameServerId, baseRevision, current => {
    const saved = structuredClone(document);
    for (const field of documentFields(current.document)) if (!field.category) addField(saved, field.path, field.value);
    return saved;
  }, now);
}

/** Reset to game defaults: an empty document. */
export function resetDraft(gameServerId: number, baseRevision: number, now = Date.now()): CheckedWrite | undefined {
  return write(gameServerId, baseRevision, () => ({}), now);
}

/** Discard changes: the document becomes `live`, the Live configuration's values. */
export function discardDraft(gameServerId: number, baseRevision: number, live: ValuesDocument, now = Date.now()): DraftWrite | undefined {
  return write(gameServerId, baseRevision, () => live, now);
}
