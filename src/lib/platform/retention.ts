/**
 * The daily sweep (spec "Retention"): deletes expired sessions, and an unused
 * Invite's row 30 days after it expires or is revoked. Used Invites stay with
 * the server owner who used them.
 *
 * The app is exactly one process (spec "Hosting"), so the sweep is a timer in
 * it, started by the startup hook: the first sweep runs a minute after start,
 * then one every 24 hours. Each deploy restarts the count, so an instance
 * deployed more than once a day still sweeps at every start.
 */
import { deleteOldInvites } from './invites';
import { log } from './log';
import { deleteExpiredSessions } from './sessions';
import { platformStore } from './storage';

export const SWEEP_INTERVAL_MS = 86_400_000;
/** After startup, so the sweep never delays the first requests. */
export const FIRST_SWEEP_DELAY_MS = 60_000;

export function sweep(now = Date.now()): void {
  platformStore().transaction(() => {
    deleteExpiredSessions(now);
    deleteOldInvites(now);
  });
}

function sweepAndLog() {
  try {
    sweep();
    log.info('sweep');
  } catch (error) {
    log.error('sweep.failed', error);
  }
}

// One schedule per process, however often startup runs (hot reloads re-run it).
const timersKey = Symbol.for('ezconfig-ui.platform-retention.timers.v1');
type Timers = { first: ReturnType<typeof setTimeout>; daily?: ReturnType<typeof setInterval> };
const shared = globalThis as typeof globalThis & { [key: symbol]: Timers | undefined };

/** Neither timer keeps a process alive by itself. */
export function startDailySweep(): void {
  stopDailySweep();
  const timers: Timers = {
    first: setTimeout(() => {
      sweepAndLog();
      timers.daily = setInterval(sweepAndLog, SWEEP_INTERVAL_MS);
      timers.daily.unref?.();
    }, FIRST_SWEEP_DELAY_MS),
  };
  timers.first.unref?.();
  shared[timersKey] = timers;
}

export function stopDailySweep(): void {
  const timers = shared[timersKey];
  if (!timers) return;
  clearTimeout(timers.first);
  clearInterval(timers.daily);
  shared[timersKey] = undefined;
}
