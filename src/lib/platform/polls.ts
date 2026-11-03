/**
 * The one in-process registry of held polls (the poll exchange is documented
 * in docs/poll-exchange.md). The app runs as exactly one process, so a game
 * server's held poll with the instance id that sent it, and when its last
 * poll ended, live here, keyed by game server, and nowhere else. A restart drops
 * them all: each game server polls again within about 10 to 20 s.
 *
 * - A poll is held for up to the hold length (50 s), then answered "no change".
 * - The newest poll from a game server supersedes the one held for it, which
 *   is answered "superseded". Superseding is logged; routine polls never are.
 * - `answerHeldPoll` answers a held poll early: an Apply wakes it with the new
 *   Live configuration. `endKey` answers it "key rejected" when Regenerate key
 *   or Delete ends the key.
 * - A poll that gets the Live configuration at once is never held
 *   (`answerAtOnce`), but it supersedes all the same.
 * - A poll whose game server hangs up while it is held ends at once.
 * - The shared-key warning: when instances that were superseded come back and
 *   supersede in turn 3 times within 5 minutes, more than one server is using
 *   the key. Only a superseded instance coming back counts, so a restart or a
 *   map change (a new instance id each time, the old one never seen again)
 *   never trips it, however often.
 *
 * Polls with a missing or unknown key are counted here too, and logged as one
 * count per clock hour. So is each Blocked Live configuration a poll finds,
 * logged once per start.
 */
import type { CategoryCommand } from '@/lib/config/encodeValues';
import { log } from './log';

/** What a poll is answered with: the response body, whose `answer` the mod switches on. */
export type PollAnswer =
  | { answer: 'no-change' }
  | { answer: 'superseded' }
  | { answer: 'key-rejected' }
  | { answer: 'not-supported-build' }
  | { answer: 'live-configuration'; liveConfigurationId: string; commands: CategoryCommand[] };

export const POLL_HOLD_MS = 50_000;
const HOUR_MS = 3_600_000;
export const SHARED_KEY_SUPERSEDES = 3;
export const SHARED_KEY_WINDOW_MS = 5 * 60_000;
/** How many superseded instance ids a game server remembers; two or three servers sharing a key need only a few. */
const SUPERSEDED_IDS_KEPT = 8;

interface HeldPoll {
  instanceId: string;
  settle(answer: PollAnswer): void;
}

interface Entry {
  held?: HeldPoll;
  /** When the last poll that is no longer held ended (answered, or its game server hung up). */
  lastEndedAt?: number;
  /** The key ended (Regenerate key) and no poll has been held since: Not connected, whenever the last poll ended. */
  keyEnded?: boolean;
  /** When each instance id that another one superseded was superseded, oldest first. */
  superseded?: Map<string, number>;
  /** When the newest supersedes by a returning instance happened, oldest first; at most SHARED_KEY_SUPERSEDES. */
  sharedKeySupersedes?: number[];
}

interface Registry {
  entries: Map<number, Entry>;
  holdMs: number;
  rejected: { hour: number; count: number; flush?: ReturnType<typeof setTimeout> };
  /** The Blocked Live configurations logged since the platform started, by id. */
  blocked?: Set<string>;
}

// Shared across Next route bundles and hot reloads, as one process holds them all.
const registryKey = Symbol.for('ezconfig-ui.platform-polls.registry.v1');
const shared = globalThis as typeof globalThis & { [key: symbol]: Registry | undefined };
const registry: Registry = shared[registryKey] ??= { entries: new Map(), holdMs: POLL_HOLD_MS, rejected: { hour: 0, count: 0 } };

/** For tests: how long a poll is held before "no change". */
export function setPollHoldMs(ms: number): void {
  registry.holdMs = ms;
}

/**
 * Holds a game server's poll until the hold length passes ("no change"), a
 * newer poll supersedes it, or `answerHeldPoll` answers it. Supersedes the
 * poll already held for that game server.
 */
export function holdPoll(gameServerId: number, instanceId: string, hangUp?: AbortSignal): Promise<PollAnswer> {
  const entry = arrive(gameServerId, instanceId);
  return new Promise(resolve => {
    let settled = false;
    const held: HeldPoll = {
      instanceId,
      settle(answer) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        hangUp?.removeEventListener('abort', hungUp);
        if (entry.held === held) entry.held = undefined;
        entry.lastEndedAt = Date.now();
        resolve(answer);
      },
    };
    // Nobody reads the answer to a poll whose game server hung up; it only has to stop being held.
    const hungUp = () => held.settle({ answer: 'no-change' });
    const timer = setTimeout(() => held.settle({ answer: 'no-change' }), registry.holdMs);
    entry.held = held;
    if (hangUp?.aborted) hungUp();
    else hangUp?.addEventListener('abort', hungUp);
  });
}

/**
 * A poll that is answered at once, never held (a delivery): like any newer
 * poll, it supersedes the one held for its game server, and it counts as a
 * poll that has just ended.
 */
export function answerAtOnce(gameServerId: number, instanceId: string): void {
  arrive(gameServerId, instanceId).lastEndedAt = Date.now();
}

/** A new poll from a game server: it supersedes the one held for it, and the key is in use again. */
function arrive(gameServerId: number, instanceId: string): Entry {
  const entry = registry.entries.get(gameServerId) ?? {};
  registry.entries.set(gameServerId, entry);
  if (entry.held) {
    const previous = entry.held.instanceId;
    entry.held.settle({ answer: 'superseded' });
    log.info('poll.superseded', { gameServerId });
    if (previous !== instanceId) countSupersede(gameServerId, entry, previous, instanceId, Date.now());
  }
  entry.keyEnded = false;
  return entry;
}

/** Answers the poll held for a game server, if there is one; true when there was. */
export function answerHeldPoll(gameServerId: number, answer: PollAnswer): boolean {
  const held = registry.entries.get(gameServerId)?.held;
  held?.settle(answer);
  return held !== undefined;
}

/**
 * Ends a game server's key, at once (Regenerate key, or Delete): a held poll
 * is answered "key rejected", and the shared-key count starts again. After a
 * regenerate it shows Not connected until a poll with the new key is held. A
 * deleted game server is forgotten, since SQLite may give its id to the next
 * one registered.
 */
export function endKey(gameServerId: number, { deleted = false } = {}): void {
  const entry = registry.entries.get(gameServerId) ?? {};
  entry.held?.settle({ answer: 'key-rejected' });
  if (deleted) {
    registry.entries.delete(gameServerId);
    return;
  }
  entry.keyEnded = true;
  entry.superseded = undefined;
  entry.sharedKeySupersedes = undefined;
  registry.entries.set(gameServerId, entry);
}

/**
 * What a game server's page is computed from: whether a poll is held now, when
 * the last one ended, whether its key ended since, and whether more than one
 * server is using its key.
 */
export function pollActivity(gameServerId: number, now = Date.now()): { held: boolean; lastEndedAt?: number; keyEnded: boolean; sharedKey: boolean } {
  const entry = registry.entries.get(gameServerId);
  return { held: entry?.held !== undefined, lastEndedAt: entry?.lastEndedAt, keyEnded: entry?.keyEnded === true, sharedKey: entry !== undefined && keyShared(entry, now) };
}

const keyShared = ({ sharedKeySupersedes: times = [] }: Entry, now: number) =>
  times.length >= SHARED_KEY_SUPERSEDES && times[0] > now - SHARED_KEY_WINDOW_MS;

/**
 * A poll from one instance superseded another's. It counts towards the
 * shared-key warning when the newcomer was itself superseded within the
 * window: instances knocking each other out, as two servers on one key do
 * about every 10 s. The warning is logged when it trips.
 */
function countSupersede(gameServerId: number, entry: Entry, previous: string, newcomer: string, now: number): void {
  const superseded = entry.superseded ??= new Map();
  const returning = (superseded.get(newcomer) ?? -Infinity) > now - SHARED_KEY_WINDOW_MS;
  superseded.delete(previous);
  superseded.set(previous, now);
  if (superseded.size > SUPERSEDED_IDS_KEPT) superseded.delete(superseded.keys().next().value!);
  if (!returning) return;
  const wasShared = keyShared(entry, now);
  const times = entry.sharedKeySupersedes ??= [];
  times.push(now);
  times.splice(0, times.length - SHARED_KEY_SUPERSEDES);
  if (!wasShared && keyShared(entry, now)) log.warn('key.shared', 'More than one server is using this key', { gameServerId });
}

/**
 * Counts a poll refused for a missing or unknown key. The count of each clock
 * hour is logged once, when the hour ends, or at the next refused poll after
 * it if the process was not running then.
 */
export function countRejectedKey(now = Date.now()): void {
  const { rejected } = registry, hour = Math.floor(now / HOUR_MS);
  if (rejected.count && rejected.hour !== hour) flushRejectedKeys();
  if (!rejected.count) {
    rejected.hour = hour;
    rejected.flush = setTimeout(flushRejectedKeys, (hour + 1) * HOUR_MS - now);
    rejected.flush.unref?.();
  }
  rejected.count += 1;
}

function flushRejectedKeys(): void {
  const { rejected } = registry;
  clearTimeout(rejected.flush);
  if (rejected.count) log.info('poll.key-rejected', { count: rejected.count });
  rejected.count = 0;
}

/**
 * A poll found its game server's Live configuration Blocked: the current
 * schema refuses values in it (live-configurations.ts). Logged the first time
 * for each one since the platform started, by id only. A restart logs it once
 * more, since a deploy may change what the schema refuses. Apply refuses what
 * the schema refuses, so only a Live configuration stored before this start
 * can be Blocked, and the ids kept stay few.
 */
export function logBlocked(gameServerId: number, liveConfigurationId: string): void {
  const logged = registry.blocked ??= new Set();
  if (logged.has(liveConfigurationId)) return;
  logged.add(liveConfigurationId);
  log.warn('live-configuration.blocked', 'The current schema refuses values in the Live configuration, so it cannot be sent', { gameServerId, liveConfigurationId });
}
