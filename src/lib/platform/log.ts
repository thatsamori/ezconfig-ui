/**
 * The one module all online-platform code logs through. Each event is one JSON
 * line, info on stdout and warnings and errors on stderr, which the systemd
 * journal keeps:
 *   {"time":"…","level":"warn","event":"key.shared","gameServerId":7,"message":"…"}
 *
 * Rules (what is logged at all is in the spec's Logging section; never routine polls):
 * - Name the event with a fixed string, never one built from input.
 * - A line names platform ids only: game server, user, Live configuration.
 *   Any other field passed in is dropped. A new field is added here, after
 *   checking it against the list below.
 * - Never logged, in an event name, a message or an error: any part of a Game
 *   server key; session tokens; `Cookie` or `Authorization` headers; Invite
 *   codes or links; Discord OAuth codes, tokens or the client secret; Note
 *   bodies; configuration values; Discord usernames; IP addresses.
 * - Pass an error or a message, never a request or another object. Only an
 *   error's message and stack are written; any other object is written as
 *   "[object not logged]".
 * - As a backstop, every string written is scrubbed of anything matching
 *   `ezc_gsk_…` and of the configured Discord client secret. Nothing else on
 *   the list has a backstop.
 *
 * Warnings and errors since process start also feed `readLogHealth()`, for the
 * operator status page. Self-hosted code keeps its `console.*` calls until it
 * is removed.
 */
import { env } from '@/lib/env';

type PlatformId = string | number;
type ProblemLevel = 'warn' | 'error';
type Level = 'info' | ProblemLevel;

const ID_FIELDS = ['userId', 'gameServerId', 'liveConfigurationId'] as const;
export type LogIds = Partial<Record<(typeof ID_FIELDS)[number], PlatformId>>;

export interface LogHealthEntry {
  time: string;
  level: ProblemLevel;
  event: string;
  message: string;
}

export interface LogHealth {
  warnings: number;
  errors: number;
  /** The newest 20, newest first. */
  recent: LogHealthEntry[];
}

const RECENT_LIMIT = 20;
const GAME_SERVER_KEY = /ezc_gsk_[A-Za-z0-9_-]*/g;
const REDACTED = '[redacted]';

// Since process start, shared across Next route bundles and hot reloads; a restart clears it.
const healthKey = Symbol.for('ezconfig-ui.platform-log.health.v1');
const shared = globalThis as typeof globalThis & { [key: symbol]: LogHealth | undefined };
const health = shared[healthKey] ??= { warnings: 0, errors: 0, recent: [] };

// Copied field by field: a caller may hand over a whole row, and only its ids may leave.
function pickIds(ids: LogIds): LogIds {
  const picked: LogIds = {};
  for (const field of ID_FIELDS) {
    const value: unknown = ids[field];
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) picked[field] = value;
  }
  return picked;
}

// Only the message and stack ever leave an error; its other fields may hold a request, headers or values.
function messageAndStack(problem: unknown): { message: string; stack?: string } {
  if (typeof problem === 'string') return { message: problem };
  if (typeof problem === 'object' && problem !== null && typeof (problem as Error).message === 'string') {
    const { message, stack } = problem as Error;
    return typeof stack === 'string' ? { message, stack } : { message };
  }
  return { message: `[${typeof problem} not logged]` };
}

// The backstop. Keys go first, so a client secret inside a key cannot leave part of the key behind.
function scrub(text: string): string {
  const withoutKeys = text.replace(GAME_SERVER_KEY, REDACTED);
  return env.discordClientSecret ? withoutKeys.split(env.discordClientSecret).join(REDACTED) : withoutKeys;
}

function write<Fields extends { level: Level; event: string }>(fields: Fields): Fields & { time: string } {
  const line = { time: new Date().toISOString(), ...fields };
  const scrubbed = Object.fromEntries(Object.entries(line).map(([field, value]) => [field, typeof value === 'string' ? scrub(value) : value])) as typeof line;
  (line.level === 'info' ? process.stdout : process.stderr).write(`${JSON.stringify(scrubbed)}\n`);
  return scrubbed;
}

function writeProblem(level: ProblemLevel, event: string, problem: unknown, ids: LogIds = {}): void {
  const line = write({ level, event, ...pickIds(ids), ...messageAndStack(problem) });
  health[level === 'warn' ? 'warnings' : 'errors'] += 1;
  health.recent.unshift({ time: line.time, level, event: line.event, message: line.message });
  health.recent.splice(RECENT_LIMIT);
}

export const log = {
  info: (event: string, ids: LogIds = {}) => { write({ level: 'info', event, ...pickIds(ids) }); },
  /** `problem` is a message or an error. */
  warn: (event: string, problem: unknown, ids?: LogIds) => writeProblem('warn', event, problem, ids),
  error: (event: string, problem: unknown, ids?: LogIds) => writeProblem('error', event, problem, ids),
};

export function readLogHealth(): LogHealth {
  return { warnings: health.warnings, errors: health.errors, recent: health.recent.map(entry => ({ ...entry })) };
}
