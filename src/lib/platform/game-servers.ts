/**
 * Game servers: registering one with its empty Draft and its Game server key,
 * finding one by its key when it polls, recording what its polls report, and
 * its connection status.
 *
 * The key is `ezc_gsk_` and 32 random bytes in base64url (51 characters). It
 * is returned once, to be shown once, and never stored, logged or returned
 * again: the database keeps its SHA-256 hash, which a poll is looked up by,
 * and its last 4 characters, which the page shows from then on.
 *
 * Connection status is computed when asked, never stored:
 * - Connected: a poll is held, or one ended within about 15 s;
 * - Not connected: shown with last seen;
 * - Never connected: no poll yet.
 * Alongside it, the view says when EZConfig needs updating: the latest poll
 * reported a build that is not the Supported build (supported-build.ts).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { PollReport, ProcessingResult } from './poll-exchange';
import { pollActivity } from './polls';
import { platformStore } from './storage';
import { isSupportedBuild, readSupportedBuild } from './supported-build';

export const GAME_SERVER_KEY_PATTERN = /^ezc_gsk_[A-Za-z0-9_-]{43}$/;
export const CONNECTED_WITHIN_MS = 15_000;
/** How often an unchanged poll writes its time to the database; the exact time is kept in memory. */
export const LAST_POLL_WRITE_INTERVAL_MS = 5 * 60_000;
const NAME_MAX = 64;

export interface GameServer {
  id: number;
  ownerId: number;
  name: string;
  keyLast4: string;
  registeredAt: number;
  lastPollAt: number | null;
  reportedBuildStamp: string | null;
  reportedLiveConfigurationId: string | null;
  /** The reported result as stored: ProcessingResult JSON. */
  reportedResult: string | null;
}

export type ConnectionStatus =
  | { state: 'connected' }
  | { state: 'not-connected'; lastSeenAt: number }
  | { state: 'never-connected' };

/** What the owner's pages show of a game server. Never holds the key. */
export interface GameServerView {
  id: number;
  name: string;
  keyLast4: string;
  registeredAt: number;
  connection: ConnectionStatus;
  /** What the latest recorded poll reported; null before the first poll. */
  lastReport: { buildStamp: string | null; processed: { liveConfigurationId: string; result: ProcessingResult } | null } | null;
  /**
   * "EZConfig needs updating": the latest poll reported a build stamp (null:
   * none) that is not the Supported build (null: none is set), so nothing is
   * sent. Null before the first poll and while it runs the Supported build.
   */
  needsUpdating: { running: string | null; supported: string | null } | null;
}

type Row = {
  id: number; owner_id: number; name: string; key_last4: string; registered_at: number; last_poll_at: number | null;
  reported_build_stamp: string | null; reported_live_configuration_id: string | null; reported_result: string | null;
};
const COLUMNS = 'id, owner_id, name, key_last4, registered_at, last_poll_at, reported_build_stamp, reported_live_configuration_id, reported_result';
const gameServer = (row: Row): GameServer => ({
  id: row.id, ownerId: row.owner_id, name: row.name, keyLast4: row.key_last4, registeredAt: row.registered_at, lastPollAt: row.last_poll_at,
  reportedBuildStamp: row.reported_build_stamp, reportedLiveConfigurationId: row.reported_live_configuration_id, reportedResult: row.reported_result,
});

const keyHash = (key: string) => createHash('sha256').update(key).digest('hex');

export type NameCheck = { ok: true; name: string; nameKey: string } | { ok: false; error: string };

/** A name as given, trimmed; `nameKey` is how names compare, ignoring case. */
export function readGameServerName(value: unknown): NameCheck {
  const name = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  if (!name) return { ok: false, error: 'Give the game server a name' };
  if ([...name].length > NAME_MAX) return { ok: false, error: `Keep the name to ${NAME_MAX} characters or fewer` };
  if (/\p{Cc}/u.test(name)) return { ok: false, error: 'The name cannot contain control characters' };
  return { ok: true, name, nameKey: name.toLowerCase() };
}

export type Registration = { ok: true; gameServer: GameServer; key: string } | { ok: false; takenBy: string };

/** Registers a game server with an empty Draft. The key returned is the only copy there will ever be. */
export function registerGameServer(ownerId: number, { name, nameKey }: { name: string; nameKey: string }, now = Date.now()): Registration {
  const store = platformStore();
  return store.transaction((): Registration => {
    const taken = store.get<{ name: string }>('SELECT name FROM game_servers WHERE owner_id = ? AND name_key = ?', ownerId, nameKey);
    if (taken) return { ok: false, takenBy: taken.name };
    const key = `ezc_gsk_${randomBytes(32).toString('base64url')}`;
    const row = store.get<Row>(
      `INSERT INTO game_servers (owner_id, name, name_key, key_hash, key_last4, registered_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
      ownerId, name, nameKey, keyHash(key), key.slice(-4), now,
    )!;
    store.run('INSERT INTO drafts (game_server_id) VALUES (?)', row.id);
    return { ok: true, gameServer: gameServer(row), key };
  });
}

/** The owner's game servers, by name. */
export function listGameServers(ownerId: number): GameServer[] {
  return platformStore().all<Row>(`SELECT ${COLUMNS} FROM game_servers WHERE owner_id = ? ORDER BY name_key, id`, ownerId).map(gameServer);
}

/** One of the owner's game servers; another owner's reads as missing. */
export function findOwnedGameServer(ownerId: number, id: number): GameServer | undefined {
  const row = platformStore().get<Row>(`SELECT ${COLUMNS} FROM game_servers WHERE id = ? AND owner_id = ?`, id, ownerId);
  return row && gameServer(row);
}

/** The game server a poll's key belongs to, if any. */
export function findGameServerByKey(key: string): GameServer | undefined {
  if (!GAME_SERVER_KEY_PATTERN.test(key)) return undefined;
  const row = platformStore().get<Row>(`SELECT ${COLUMNS} FROM game_servers WHERE key_hash = ?`, keyHash(key));
  return row && gameServer(row);
}

/**
 * Records a poll: the reported build stamp, processed id and result as
 * reported, and the poll time. An unchanged report writes its time at most
 * every 5 minutes; between writes, the time the poll ended is in memory.
 */
export function recordPoll(server: GameServer, report: PollReport, now = Date.now()): void {
  const liveConfigurationId = report.processed?.liveConfigurationId ?? null;
  const result = report.processed ? JSON.stringify(report.processed.result) : null;
  const changed = server.reportedBuildStamp !== report.buildStamp || server.reportedLiveConfigurationId !== liveConfigurationId || server.reportedResult !== result;
  if (!changed && server.lastPollAt !== null && now - server.lastPollAt < LAST_POLL_WRITE_INTERVAL_MS) return;
  platformStore().run(
    'UPDATE game_servers SET last_poll_at = ?, reported_build_stamp = ?, reported_live_configuration_id = ?, reported_result = ? WHERE id = ?',
    now, report.buildStamp, liveConfigurationId, result, server.id,
  );
}

export function connectionStatus(server: Pick<GameServer, 'id' | 'lastPollAt'>, now = Date.now()): ConnectionStatus {
  const activity = pollActivity(server.id);
  if (activity.held) return { state: 'connected' };
  const lastSeenAt = Math.max(server.lastPollAt ?? -Infinity, activity.lastEndedAt ?? -Infinity);
  if (lastSeenAt === -Infinity) return { state: 'never-connected' };
  return now - lastSeenAt <= CONNECTED_WITHIN_MS ? { state: 'connected' } : { state: 'not-connected', lastSeenAt };
}

/**
 * For the platform operator's status page: how many game servers are
 * registered and Connected, and the build stamp each Connected one reported
 * last (null: none). Names no game server or owner.
 */
export function countGameServers(now = Date.now()): { registered: number; connectedBuildStamps: (string | null)[] } {
  const rows = platformStore().all<{ id: number; last_poll_at: number | null; reported_build_stamp: string | null }>('SELECT id, last_poll_at, reported_build_stamp FROM game_servers');
  const connected = rows.filter(row => connectionStatus({ id: row.id, lastPollAt: row.last_poll_at }, now).state === 'connected');
  return { registered: rows.length, connectedBuildStamps: connected.map(row => row.reported_build_stamp) };
}

export function gameServerView(server: GameServer, now = Date.now(), supportedBuild = readSupportedBuild()?.stamp ?? null): GameServerView {
  const outdated = server.lastPollAt !== null && !isSupportedBuild(server.reportedBuildStamp, supportedBuild);
  return {
    id: server.id,
    name: server.name,
    keyLast4: server.keyLast4,
    registeredAt: server.registeredAt,
    connection: connectionStatus(server, now),
    lastReport: server.lastPollAt === null ? null : {
      buildStamp: server.reportedBuildStamp,
      processed: server.reportedLiveConfigurationId === null || server.reportedResult === null ? null
        : { liveConfigurationId: server.reportedLiveConfigurationId, result: JSON.parse(server.reportedResult) as ProcessingResult },
    },
    needsUpdating: outdated ? { running: server.reportedBuildStamp, supported: supportedBuild } : null,
  };
}
