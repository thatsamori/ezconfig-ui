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
 *   Live configuration, and Regenerate key or Delete answers it "key rejected".
 * - A poll whose game server hangs up while it is held ends at once.
 *
 * Polls with a missing or unknown key are counted here too, and logged as one
 * count per clock hour.
 */
import { log } from './log';

/** What a poll is answered with: the response body, whose `answer` the mod switches on. */
export type PollAnswer =
  | { answer: 'no-change' }
  | { answer: 'superseded' }
  | { answer: 'key-rejected' }
  | { answer: 'not-supported-build' };

export const POLL_HOLD_MS = 50_000;
const HOUR_MS = 3_600_000;

interface HeldPoll {
  instanceId: string;
  settle(answer: PollAnswer): void;
}

interface Entry {
  held?: HeldPoll;
  /** When the last poll that is no longer held ended (answered, or its game server hung up). */
  lastEndedAt?: number;
}

interface Registry {
  entries: Map<number, Entry>;
  holdMs: number;
  rejected: { hour: number; count: number; flush?: ReturnType<typeof setTimeout> };
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
  const entry = registry.entries.get(gameServerId) ?? {};
  registry.entries.set(gameServerId, entry);
  if (entry.held) {
    entry.held.settle({ answer: 'superseded' });
    log.info('poll.superseded', { gameServerId });
  }
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

/** Answers the poll held for a game server, if there is one; true when there was. */
export function answerHeldPoll(gameServerId: number, answer: PollAnswer): boolean {
  const held = registry.entries.get(gameServerId)?.held;
  held?.settle(answer);
  return held !== undefined;
}

/** What connection status is computed from: whether a poll is held now, and when the last one ended. */
export function pollActivity(gameServerId: number): { held: boolean; lastEndedAt?: number } {
  const entry = registry.entries.get(gameServerId);
  return { held: entry?.held !== undefined, lastEndedAt: entry?.lastEndedAt };
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
