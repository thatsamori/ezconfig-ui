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
 * - A Live configuration holding a value the current schema refuses, as a
 *   later deploy that tightens a key can leave one (online-platform#44), is
 *   Blocked: it is never sent, whole or in part. The poll is held as if there
 *   were nothing to send, until an Apply of the fixed Draft wakes it.
 * - Its state (Pending, Blocked, Confirmed or Failed) is computed from the
 *   game server's last report and the current schema, never stored.
 * - Discard changes resets the Draft to the Live configuration, origin
 *   included.
 * - Apply copies the Draft's origin (a Ruleset version, or none) with its
 *   values. The page shows each origin and whether it is modified (origins.ts).
 *
 * Nothing here logs: the routes log Apply, each delivery and each Blocked Live
 * configuration, by id only.
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { encodeValues } from '@/lib/config/encodeValues';
import { documentFields, refusedValues, type DocumentField, type FieldError, type ValuesDocument } from '@/lib/config/valuesDocument';
import type { ConfigValue } from '@/lib/database/types';
import { discardDraft, readDraft, type CheckedWrite, type Draft } from './drafts';
import type { GameServer, GameServerView } from './game-servers';
import { originOf } from './origins';
import type { ProcessingResult, UnknownKey } from './poll-exchange';
import { answerHeldPoll, type PollAnswer } from './polls';
import { platformStore } from './storage';

export interface LiveConfiguration {
  gameServerId: number;
  /** A random UUID, new with each Apply: what a delivery carries and the mod reports processing. */
  id: string;
  document: ValuesDocument;
  appliedAt: number;
  /** The Draft's origin when it was applied: a Ruleset version's id, or null for none. */
  originId: number | null;
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

type Row = { game_server_id: number; id: string; overrides: string; applied_at: number; origin_id: number | null };
const liveConfiguration = (row: Row): LiveConfiguration => ({ gameServerId: row.game_server_id, id: row.id, document: JSON.parse(row.overrides), appliedAt: row.applied_at, originId: row.origin_id });

export function readLiveConfiguration(gameServerId: number): LiveConfiguration | undefined {
  const row = platformStore().get<Row>('SELECT game_server_id, id, overrides, applied_at, origin_id FROM live_configurations WHERE game_server_id = ?', gameServerId);
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

const review = (draft: Draft, live: LiveConfiguration | undefined): ApplyReview => ({
  revision: draft.revision,
  liveConfigurationId: live?.id ?? null,
  ...valueChanges(draft.document, live?.document ?? {}),
  errors: refusedValues(draft.document),
});

/** The review of an Apply now; undefined when the game server has no Draft. */
export function applyReview(gameServerId: number): ApplyReview | undefined {
  const draft = readDraft(gameServerId);
  return draft && review(draft, readLiveConfiguration(gameServerId));
}

/**
 * What the game server has reported of its Live configuration, computed from
 * its last report and the current schema, never stored:
 * - Confirmed: it reports processing this Live configuration, and every
 *   command succeeded. Keys its build does not know were skipped: `ignoredKeys`.
 * - Failed: it reports processing this Live configuration, and processing
 *   stopped at a failed command (the wipe, when `database` and `category` are
 *   ''). It runs only the categories before it, and is not sent it again
 *   until a build change or an Apply.
 * - Blocked: it has not reported processing this Live configuration, and the
 *   current schema refuses `refusedValues` in it, so it cannot be sent. Fixing
 *   them in the Draft and Apply sends the new one. Confirmed and Failed stay
 *   as reported, since they say what the game server runs.
 * - Pending: anything else, including an id the platform does not know, or
 *   none (it is sent the Live configuration at its next poll).
 * `reportedAt` is when the report first arrived.
 */
export type LiveConfigurationState =
  | { state: 'pending' }
  | { state: 'blocked'; refusedValues: FieldError[] }
  | { state: 'confirmed'; reportedAt: number; ignoredKeys: UnknownKey[] }
  | { state: 'failed'; reportedAt: number; failure: NonNullable<ProcessingResult['failure']> };

export function liveConfigurationState(live: Pick<LiveConfiguration, 'id' | 'document'>, server: Pick<GameServer, 'lastPollAt' | 'reportedLiveConfigurationId' | 'reportedResult' | 'reportedProcessedAt'>): LiveConfigurationState {
  if (server.reportedLiveConfigurationId !== live.id || server.reportedResult === null) {
    const refused = refusedValues(live.document);
    return refused.length ? { state: 'blocked', refusedValues: refused } : { state: 'pending' };
  }
  const result = JSON.parse(server.reportedResult) as ProcessingResult;
  const reportedAt = server.reportedProcessedAt ?? server.lastPollAt!;
  // A result reads as succeeded with no failure, or failed with one (poll-exchange.ts).
  return result.failure === null ? { state: 'confirmed', reportedAt, ignoredKeys: result.unknownKeys } : { state: 'failed', reportedAt, failure: result.failure };
}

/** How many game servers have a Live configuration in each state, and how many have none yet. */
export type LiveConfigurationCounts = Record<LiveConfigurationState['state'] | 'none', number>;

/**
 * Every game server's Live configuration, read through
 * `liveConfigurationState`, so each count is what its page shows. Also when
 * each was applied: one time per game server, its latest Apply. A Live
 * configuration the game server has not reported is checked against the
 * schema, as that state needs.
 */
export function countLiveConfigurations(): { states: LiveConfigurationCounts; appliedAt: number[] } {
  type StateRow = {
    id: string | null; overrides: string | null; applied_at: number | null;
    last_poll_at: number | null; reported_live_configuration_id: string | null; reported_result: string | null; reported_processed_at: number | null;
  };
  const rows = platformStore().all<StateRow>(`SELECT live.id, live.overrides, live.applied_at,
    server.last_poll_at, server.reported_live_configuration_id, server.reported_result, server.reported_processed_at
    FROM game_servers AS server LEFT JOIN live_configurations AS live ON live.game_server_id = server.id`);
  const states: LiveConfigurationCounts = { pending: 0, blocked: 0, confirmed: 0, failed: 0, none: 0 };
  const appliedAt: number[] = [];
  for (const row of rows) {
    if (row.id === null) {
      states.none++;
      continue;
    }
    const { state } = liveConfigurationState({ id: row.id, document: JSON.parse(row.overrides!) }, {
      lastPollAt: row.last_poll_at, reportedLiveConfigurationId: row.reported_live_configuration_id, reportedResult: row.reported_result, reportedProcessedAt: row.reported_processed_at,
    });
    states[state]++;
    appliedAt.push(row.applied_at!);
  }
  return { states, appliedAt };
}

/**
 * What the game server's page shows: the Live configuration with its state
 * (null before the first Apply), and whether the Draft has Unapplied changes:
 * it differs from the Live configuration, or, before the first Apply, sets
 * any value. Also each one's origin, and whether it is modified from it.
 */
export function liveConfigurationView(server: GameServer): Pick<GameServerView, 'liveConfiguration' | 'unappliedChanges' | 'draftOrigin' | 'liveOrigin'> {
  const live = readLiveConfiguration(server.id);
  const draft = readDraft(server.id);
  const { added, changed, reset } = valueChanges(draft?.document ?? {}, live?.document ?? {});
  return {
    liveConfiguration: live ? { id: live.id, appliedAt: live.appliedAt, ...liveConfigurationState(live, server) } : null,
    unappliedChanges: added.length + changed.length + reset.length > 0,
    draftOrigin: draft ? originOf(draft.originId, draft.document) : null,
    liveOrigin: live ? originOf(live.originId, live.document) : null,
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
    const errors = refusedValues(draft.document);
    if (errors.length) return { ok: false, reason: 'invalid', errors };
    const applied: LiveConfiguration = { gameServerId, id: randomUUID(), document: draft.document, appliedAt: now, originId: draft.originId };
    store.run('DELETE FROM live_configurations WHERE game_server_id = ?', gameServerId);
    store.run('INSERT INTO live_configurations (game_server_id, id, overrides, applied_at, origin_id) VALUES (?, ?, ?, ?, ?)', gameServerId, applied.id, JSON.stringify(applied.document), now, applied.originId);
    return { ok: true, liveConfiguration: applied };
  });
  // Only once it is committed: a game server waiting in its held poll gets it within one round trip.
  if (result?.ok) answerHeldPoll(gameServerId, deliveryOf(result.liveConfiguration));
  return result;
}

/** The answer that delivers a Live configuration: its id, and its values grouped by category with the deploy's schema, which must accept them all (never a Blocked one). */
export function deliveryOf(live: LiveConfiguration): Extract<PollAnswer, { answer: 'live-configuration' }> {
  return { answer: 'live-configuration', liveConfigurationId: live.id, commands: encodeValues(live.document) };
}

/**
 * What a poll on the Supported build is answered with at once: the whole Live
 * configuration when the game server reports processing another id, one the
 * platform does not know, or none. `blocked`, with its id, when that Live
 * configuration is Blocked: it is never sent, so the poll is held. Undefined
 * when it has no Live configuration, or reports processing this one.
 */
export function pendingDelivery(gameServerId: number, processedId: string | null): ReturnType<typeof deliveryOf> | { blocked: string } | undefined {
  const live = readLiveConfiguration(gameServerId);
  if (!live || live.id === processedId) return undefined;
  return refusedValues(live.document).length ? { blocked: live.id } : deliveryOf(live);
}

/**
 * Discard changes: the Draft becomes the Live configuration's values and
 * origin, if it is still at `baseRevision`. Undefined when the game server has
 * no Draft, or no Live configuration to discard to.
 */
export function discardChanges(gameServerId: number, baseRevision: number, now = Date.now()): CheckedWrite | undefined {
  // The Live configuration is read in the Draft write's transaction, so an Apply cannot come between.
  return platformStore().transaction((): CheckedWrite | undefined => {
    const live = readLiveConfiguration(gameServerId);
    return live && discardDraft(gameServerId, baseRevision, live, now);
  });
}
