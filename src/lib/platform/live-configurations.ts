/**
 * Live configurations (online-platform#32): what each game server should run,
 * at most one each and none until its first Apply. Apply makes the whole
 * Draft the Live configuration, and delivery sends it to the game server.
 *
 * - The review compares the Draft with the Live configuration over the values
 *   the current schema has a place for, exactly: a value equal to its game
 *   default is still an override. Before the first Apply it lists every value
 *   the Draft sets, since every EZConfig value the server has now is replaced.
 * - Apply carries the Draft revision and the Live configuration id (or none)
 *   its review was built from, and is refused when either has moved on. It
 *   validates the whole Draft against the current schema, then in one
 *   transaction replaces the Live configuration with a new one under a new
 *   random id, even when nothing changed. After the commit it wakes the game
 *   server's held poll with it. That the game server is Connected and on the
 *   Supported build is the route's check (`GameServerView.applyBlocked`).
 * - Delivery: a poll on the Supported build that reports processing any other
 *   id, or none, is answered at once with the whole Live configuration,
 *   grouped by category through the encoder. With no Live configuration
 *   nothing is ever sent, so a first poll never wipes a game server. A poll
 *   reporting this id gets nothing, whether processing it succeeded or failed:
 *   a Failed configuration is sent again only by an Apply, which makes a new
 *   id even when nothing changed, or after a build change, when the mod
 *   reports none.
 * - Its state (Pending, Confirmed or Failed) is computed from the game
 *   server's last report, never stored.
 * - Discard changes resets the Draft to the Live configuration.
 *
 * Nothing here logs: the routes log Apply and each delivery, by id only.
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { encodeValues } from '@/lib/config/encodeValues';
import { documentErrors, documentFields, type DocumentField, type FieldError, type ValuesDocument } from '@/lib/config/valuesDocument';
import type { ConfigValue } from '@/lib/database/types';
import { discardDraft, readDraft, type Draft, type DraftWrite } from './drafts';
import type { GameServer, GameServerView } from './game-servers';
import type { ProcessingResult, UnknownKey } from './poll-exchange';
import { answerHeldPoll, type PollAnswer } from './polls';
import { platformStore } from './storage';

export interface LiveConfiguration {
  gameServerId: number;
  /** A random UUID, new with each Apply: what a delivery carries and the mod reports processing. */
  id: string;
  document: ValuesDocument;
  appliedAt: number;
}

/** One value an Apply changes. `live` is absent for a key the Draft adds; `draft` for a key it resets to game default. */
export interface ReviewEntry {
  database: string;
  category: string;
  key: string;
  live?: ConfigValue;
  draft?: ConfigValue;
}

export interface ValueChanges {
  added: ReviewEntry[];
  changed: ReviewEntry[];
  reset: ReviewEntry[];
}

/**
 * What Apply would do now. With no Live configuration (`liveConfigurationId`
 * null: the first Apply), `added` is every value the Draft sets. No changes
 * at all still sends the configuration again. Apply is blocked while
 * `errors` lists values the current schema refuses.
 */
export interface ApplyReview extends ValueChanges {
  revision: number;
  liveConfigurationId: string | null;
  errors: FieldError[];
}

export type ApplyResult =
  | { ok: true; liveConfiguration: LiveConfiguration }
  | { ok: false; reason: 'stale'; review: ApplyReview }
  | { ok: false; reason: 'invalid'; errors: FieldError[] };

type Row = { game_server_id: number; id: string; overrides: string; applied_at: number };
const liveConfiguration = (row: Row): LiveConfiguration => ({ gameServerId: row.game_server_id, id: row.id, document: JSON.parse(row.overrides), appliedAt: row.applied_at });

export function readLiveConfiguration(gameServerId: number): LiveConfiguration | undefined {
  const row = platformStore().get<Row>('SELECT game_server_id, id, overrides, applied_at FROM live_configurations WHERE game_server_id = ?', gameServerId);
  return row && liveConfiguration(row);
}

/** The values the current schema has a place for, by path: one it has none for is never sent, so it is never a change. */
const placed = (document: unknown) => new Map(documentFields(document).filter(field => field.category).map(field => [JSON.stringify(field.path), field]));
const entry = ({ database, category, key }: DocumentField, values: Pick<ReviewEntry, 'live' | 'draft'>): ReviewEntry => ({ database, category: category!, key, ...values });
const sortKey = ({ database, category, key }: ReviewEntry) => [database === 'Character' ? '' : database, category, key];
const inOrder = (a: ReviewEntry, b: ReviewEntry) => {
  const [x, y] = [sortKey(a), sortKey(b)];
  return x.map((part, index) => part.localeCompare(y[index])).find(order => order !== 0) ?? 0;
};

/** The values `draft` adds, changes and resets to game default against `live`, Character first, then by weapon, category and key. */
export function valueChanges(draft: unknown, live: unknown): ValueChanges {
  const before = placed(live), after = placed(draft);
  const changes: ValueChanges = { added: [], changed: [], reset: [] };
  for (const [path, field] of after) {
    const previous = before.get(path);
    if (!previous) changes.added.push(entry(field, { draft: field.value as ConfigValue }));
    else if (!isDeepStrictEqual(previous.value, field.value)) changes.changed.push(entry(field, { live: previous.value as ConfigValue, draft: field.value as ConfigValue }));
  }
  for (const [path, field] of before) if (!after.has(path)) changes.reset.push(entry(field, { live: field.value as ConfigValue }));
  for (const list of Object.values(changes)) list.sort(inOrder);
  return changes;
}

/** The Draft's values the current schema refuses; a value it has no place for is not sent, so it never blocks Apply. */
const applyErrors = (document: unknown) => documentErrors(document).filter(error => error.category !== undefined);

const review = (draft: Draft, live: LiveConfiguration | undefined): ApplyReview => ({
  revision: draft.revision,
  liveConfigurationId: live?.id ?? null,
  ...valueChanges(draft.document, live?.document ?? {}),
  errors: applyErrors(draft.document),
});

/** The review of an Apply now; undefined when the game server has no Draft. */
export function applyReview(gameServerId: number): ApplyReview | undefined {
  const draft = readDraft(gameServerId);
  return draft && review(draft, readLiveConfiguration(gameServerId));
}

/**
 * What the game server has reported of its Live configuration, computed from
 * its last report and never stored:
 * - Confirmed: it reports processing this Live configuration, and every
 *   command succeeded. Keys its build does not know were skipped: `ignoredKeys`.
 * - Failed: it reports processing this Live configuration, and processing
 *   stopped at a failed command (the wipe, when `database` and `category` are
 *   ''). It runs only the categories before it, and is not sent it again
 *   until a build change or an Apply.
 * - Pending: anything else, including an id the platform does not know, or
 *   none (it is sent the Live configuration at its next poll).
 * `reportedAt` is when the report first arrived.
 */
export type LiveConfigurationState =
  | { state: 'pending' }
  | { state: 'confirmed'; reportedAt: number; ignoredKeys: UnknownKey[] }
  | { state: 'failed'; reportedAt: number; failure: NonNullable<ProcessingResult['failure']> };

export function liveConfigurationState(liveConfigurationId: string, server: Pick<GameServer, 'lastPollAt' | 'reportedLiveConfigurationId' | 'reportedResult' | 'reportedProcessedAt'>): LiveConfigurationState {
  if (server.reportedLiveConfigurationId !== liveConfigurationId || server.reportedResult === null) return { state: 'pending' };
  const result = JSON.parse(server.reportedResult) as ProcessingResult;
  const reportedAt = server.reportedProcessedAt ?? server.lastPollAt!;
  // A result reads as succeeded with no failure, or failed with one (poll-exchange.ts).
  return result.failure === null ? { state: 'confirmed', reportedAt, ignoredKeys: result.unknownKeys } : { state: 'failed', reportedAt, failure: result.failure };
}

/**
 * What the game server's page shows: the Live configuration with its state
 * (null before the first Apply), and whether the Draft has Unapplied changes:
 * it differs from the Live configuration, or, before the first Apply, sets
 * any value.
 */
export function liveConfigurationView(server: GameServer): Pick<GameServerView, 'liveConfiguration' | 'unappliedChanges'> {
  const live = readLiveConfiguration(server.id);
  const { added, changed, reset } = valueChanges(readDraft(server.id)?.document ?? {}, live?.document ?? {});
  return {
    liveConfiguration: live ? { id: live.id, appliedAt: live.appliedAt, ...liveConfigurationState(live.id, server) } : null,
    unappliedChanges: added.length + changed.length + reset.length > 0,
  };
}

/**
 * Apply: the Draft becomes the game server's Live configuration, if the Draft
 * is still at `base.revision` and the Live configuration is still
 * `base.liveConfigurationId` (null: none), and the current schema accepts
 * every value. Then the game server's held poll, if any, is answered with it.
 * Undefined when the game server has no Draft.
 */
export function applyDraft(gameServerId: number, base: { revision: number; liveConfigurationId: string | null }, now = Date.now()): ApplyResult | undefined {
  const store = platformStore();
  const result = store.transaction((): ApplyResult | undefined => {
    const draft = readDraft(gameServerId);
    if (!draft) return undefined;
    const current = readLiveConfiguration(gameServerId);
    if (draft.revision !== base.revision || (current?.id ?? null) !== base.liveConfigurationId) return { ok: false, reason: 'stale', review: review(draft, current) };
    const errors = applyErrors(draft.document);
    if (errors.length) return { ok: false, reason: 'invalid', errors };
    const applied: LiveConfiguration = { gameServerId, id: randomUUID(), document: draft.document, appliedAt: now };
    store.run('DELETE FROM live_configurations WHERE game_server_id = ?', gameServerId);
    store.run('INSERT INTO live_configurations (game_server_id, id, overrides, applied_at) VALUES (?, ?, ?, ?)', gameServerId, applied.id, JSON.stringify(applied.document), now);
    return { ok: true, liveConfiguration: applied };
  });
  // Only once it is committed: a game server waiting in its held poll gets it within one round trip.
  if (result?.ok) answerHeldPoll(gameServerId, deliveryOf(result.liveConfiguration));
  return result;
}

/** The answer that delivers a Live configuration: its id, and its values grouped by category with the deploy's schema. */
export function deliveryOf(live: LiveConfiguration): Extract<PollAnswer, { answer: 'live-configuration' }> {
  return { answer: 'live-configuration', liveConfigurationId: live.id, commands: encodeValues(live.document) };
}

/**
 * What a poll on the Supported build is answered with at once: the whole Live
 * configuration when the game server reports processing another id, one the
 * platform does not know, or none. Undefined when it has no Live
 * configuration, or reports processing this one.
 */
export function pendingDelivery(gameServerId: number, processedId: string | null): ReturnType<typeof deliveryOf> | undefined {
  const live = readLiveConfiguration(gameServerId);
  return live && live.id !== processedId ? deliveryOf(live) : undefined;
}

/**
 * Discard changes: the Draft becomes the Live configuration's values, if it is
 * still at `baseRevision`. Undefined when the game server has no Draft, or no
 * Live configuration to discard to.
 */
export function discardChanges(gameServerId: number, baseRevision: number, now = Date.now()): DraftWrite | undefined {
  const live = readLiveConfiguration(gameServerId);
  return live && discardDraft(gameServerId, baseRevision, live.document, now);
}
