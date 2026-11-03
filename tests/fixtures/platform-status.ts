/**
 * The platform operator's status page through its route handler
 * (online-platform#38): counts by build stamp, the health list, the backup
 * heartbeat's warnings and the restore check's states, and access. One
 * scenario per run (argv[2]), each in its own process with the env set by
 * tests/platform-status.test.ts, since the log health and the heartbeat live
 * in process memory. The clock is moved with setSystemTime; polls are held for
 * a short real time (setPollHoldMs).
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the Game
 * server keys and names it handled, so the test can check that no log line,
 * and no status, holds one.
 */
import { setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { GameServerView } from '../../src/lib/platform/game-servers';
import type { PlatformStatus } from '../../src/lib/platform/status';

const { env } = await import('../../src/lib/env');
const { log } = await import('../../src/lib/platform/log');
const { answerHeldPoll, setPollHoldMs } = await import('../../src/lib/platform/polls');
const { PROCESS_STARTED_AT } = await import('../../src/lib/platform/status');
const { restoreCheckPath } = await import('../../src/lib/platform/restore-check');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const supportedBuildRoute = await import('../../src/app/api/operator/supported-build/route');
const statusRoute = await import('../../src/app/api/operator/status/route');
const pollRoute = await import('../../src/app/game-server/poll/route');
const heartbeatRoute = await import('../../src/app/internal/backup-heartbeat/route');

const scenario = process.argv[2];
const secrets = new Set<string>();
const [OPERATOR_ID] = env.operatorDiscordIds;
const SECOND = 1000, MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const T0 = Math.ceil(Date.now() / HOUR) * HOUR;
const at = (time: number) => setSystemTime(new Date(time));
const SUPPORTED = '20261102-153000', OLDER = '20261020-090000';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

async function signIn(name: string, discordId?: string) {
  secrets.add(name);
  return signInForTest(name, discordId);
}
async function registered(session: TestSession, name: string) {
  secrets.add(name);
  const response = await gameServersRoute.POST(session.request('/api/game-servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }));
  assert.equal(response.status, 201, `${name} registers`);
  const { data } = await response.json() as { data: { gameServer: GameServerView; key: string } };
  secrets.add(data.key);
  return data;
}
/** A game server polling with its key and a build stamp ('' for none), as the mod sends it. */
async function poll(key: string, buildStamp: string) {
  const response = await pollRoute.POST(new Request(new URL('/game-server/poll', env.publicUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ buildStamp, instanceId: 'instance-one' }),
  }));
  return (await response.json() as { answer: string }).answer;
}

type Answer = { status: number; cache: string | null; body: PlatformStatus & { success?: boolean; error?: string } };
async function readStatus(session?: TestSession): Promise<Answer> {
  const request = session ? session.request('/api/operator/status') : new Request(new URL('/api/operator/status', env.publicUrl));
  const response = await statusRoute.GET(request);
  return { status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() };
}
async function statusOf(session: TestSession): Promise<PlatformStatus> {
  const answer = await readStatus(session);
  assert.deepEqual([answer.status, answer.cache], [200, 'no-store']);
  const written = JSON.stringify(answer.body);
  for (const secret of secrets) assert(!written.includes(secret), 'the status names no game server, owner or key');
  return answer.body;
}

const scenarios: Record<string, () => Promise<void>> = {
  /** Registered, Connected now, and Connected by reported build stamp with the Supported build marked. */
  async counts() {
    const operator = await signIn('Op Status', OPERATOR_ID);
    const alpha = await signIn('Owner Alpha');
    const beta = await signIn('Owner Beta');
    at(T0);
    let status = await statusOf(operator);
    assert.deepEqual(status.gameServers, { registered: 0, connected: 0, supportedBuild: null, connectedByBuild: [] }, 'nothing registered, no Supported build');

    const supported = await supportedBuildRoute.PUT(operator.request('/api/operator/supported-build', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stamp: SUPPORTED }) }));
    assert.equal(supported.status, 200);
    const [a1, a2, a3, b1, b2, b3] = [
      await registered(alpha, 'Alpha One'), await registered(alpha, 'Alpha Two'), await registered(alpha, 'Alpha Three'),
      await registered(beta, 'Beta One'), await registered(beta, 'Beta Two'), await registered(beta, 'Beta Three'),
    ];
    await registered(beta, 'Beta Never');
    status = await statusOf(operator);
    assert.deepEqual(status.gameServers, { registered: 7, connected: 0, supportedBuild: SUPPORTED, connectedByBuild: [{ buildStamp: SUPPORTED, count: 0, supported: true }] }, 'the Supported build is listed with none on it');

    setPollHoldMs(80);
    at(T0 - MINUTE);
    assert.equal(await poll(a3.key, SUPPORTED), 'no-change', 'a minute ago: Not connected now');
    at(T0);
    assert.deepEqual(await Promise.all([poll(a2.key, SUPPORTED), poll(b1.key, OLDER), poll(b2.key, ''), poll(b3.key, 'dev build')]),
      ['no-change', 'not-supported-build', 'not-supported-build', 'not-supported-build']);
    // A1's poll is held while the page loads.
    setPollHoldMs(60_000);
    const held = poll(a1.key, SUPPORTED);
    await Bun.sleep(30);
    status = await statusOf(operator);
    assert.deepEqual(status.gameServers, {
      registered: 7, connected: 5, supportedBuild: SUPPORTED,
      connectedByBuild: [
        { buildStamp: SUPPORTED, count: 2, supported: true },
        { buildStamp: 'dev build', count: 1, supported: false },
        { buildStamp: OLDER, count: 1, supported: false },
        { buildStamp: null, count: 1, supported: false },
      ],
    });
    assert(answerHeldPoll(a1.gameServer.id, { answer: 'no-change' }));
    assert.equal(await held, 'no-change');

    // Once the Supported build switches, the same game servers are counted on its side.
    const switched = await supportedBuildRoute.PUT(operator.request('/api/operator/supported-build', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stamp: OLDER }) }));
    assert.equal(switched.status, 200);
    status = await statusOf(operator);
    assert.equal(status.gameServers.connected, 5, 'within 15 s of their last poll, still Connected');
    assert.deepEqual(status.gameServers.connectedByBuild.map(({ buildStamp, supported }) => [buildStamp, supported]),
      [[SUPPORTED, false], ['dev build', false], [OLDER, true], [null, false]]);

    at(T0 + 16 * SECOND);
    status = await statusOf(operator);
    assert.deepEqual(status.gameServers, { registered: 7, connected: 0, supportedBuild: OLDER, connectedByBuild: [{ buildStamp: OLDER, count: 0, supported: true }] });
  },

  /** The release commit, running since, and the warnings and errors since start with the newest 20, scrubbed. */
  async health() {
    const operator = await signIn('Op Health', OPERATOR_ID);
    const owner = await signIn('Plain Owner');
    let status = await statusOf(operator);
    assert.deepEqual([status.health.warnings, status.health.errors, status.health.recent], [0, 0, []], 'nothing logged since start');
    assert.equal(status.health.startedAt, PROCESS_STARTED_AT);
    assert(status.health.startedAt <= Date.now() && Date.now() - status.health.startedAt < 60 * SECOND, 'running since this process started');
    assert.equal(status.health.releaseCommit, null, 'a worktree checkout is not a release');

    // A refused request is a warning like any other.
    assert.equal((await readStatus(owner)).status, 403);
    const key = `ezc_gsk_${'k'.repeat(43)}`;
    secrets.add(key);
    for (let n = 1; n <= 22; n++) log.warn('fixture.warned', `warning ${n}`, { gameServerId: n });
    log.error('fixture.failed', new Error(`failed with ${key} in its message`), { userId: 1 });
    log.error('fixture.failed', 'second error');
    log.info('fixture.noted');
    status = await statusOf(operator);
    assert.equal(status.health.warnings, 23);
    assert.equal(status.health.errors, 2);
    assert.equal(status.health.recent.length, 20, 'the newest 20');
    for (const entry of status.health.recent) {
      assert.deepEqual(Object.keys(entry).sort(), ['event', 'level', 'message', 'time'], 'no ids');
      assert(!Number.isNaN(Date.parse(entry.time)));
    }
    const withoutTimes = status.health.recent.map(({ level, event, message }) => ({ level, event, message }));
    assert.deepEqual(withoutTimes.slice(0, 4), [
      { level: 'error', event: 'fixture.failed', message: 'second error' },
      { level: 'error', event: 'fixture.failed', message: 'failed with [redacted] in its message' },
      { level: 'warn', event: 'fixture.warned', message: 'warning 22' },
      { level: 'warn', event: 'fixture.warned', message: 'warning 21' },
    ]);
    assert.deepEqual(withoutTimes.at(-1), { level: 'warn', event: 'fixture.warned', message: 'warning 5' }, 'older ones dropped');

    // Run from a release folder: release.sh checks the commit out with a detached HEAD.
    const release = join(dirname(env.databasePath), 'release');
    mkdirSync(join(release, '.git'), { recursive: true });
    writeFileSync(join(release, '.git', 'HEAD'), `${COMMIT}\n`);
    process.chdir(release);
    assert.equal((await statusOf(operator)).health.releaseCommit, COMMIT);
    writeFileSync(join(release, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    assert.equal((await statusOf(operator)).health.releaseCommit, null, 'a checkout on a branch is not a release');
  },

  /** "Backup: last confirmed 40 s ago"; a warning after 5 minutes without a heartbeat, or 5 minutes after start with none. */
  async backup() {
    const operator = await signIn('Op Backup', OPERATOR_ID);
    const heartbeat = async () => {
      const response = heartbeatRoute.GET(new Request('http://127.0.0.1:3000/internal/backup-heartbeat', { headers: { host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1' } }));
      assert.equal(response.status, 204);
    };
    const backup = async () => (await statusOf(operator)).backup;
    const OVERDUE = 'Litestream has not confirmed a backup for more than 5 minutes: it may have stopped, or it cannot reach the bucket.';

    at(PROCESS_STARTED_AT + 4 * MINUTE);
    assert.deepEqual(await backup(), { lastConfirmedAt: null, summary: 'Backup: not confirmed since the app started 4 min ago', warning: null }, 'none yet, but not 5 minutes since start');
    at(PROCESS_STARTED_AT + 5 * MINUTE);
    assert.equal((await backup()).warning, null);
    at(PROCESS_STARTED_AT + 5 * MINUTE + SECOND);
    assert.deepEqual(await backup(), { lastConfirmedAt: null, summary: 'Backup: not confirmed since the app started 5 min ago', warning: OVERDUE });

    const first = PROCESS_STARTED_AT + 6 * MINUTE;
    at(first);
    await heartbeat();
    assert.deepEqual(await backup(), { lastConfirmedAt: first, summary: 'Backup: last confirmed 0 s ago', warning: null });
    at(first + 40 * SECOND);
    assert.deepEqual(await backup(), { lastConfirmedAt: first, summary: 'Backup: last confirmed 40 s ago', warning: null });
    // Every 75 s, as Litestream calls it.
    at(first + 75 * SECOND);
    await heartbeat();
    at(first + 75 * SECOND + 5 * MINUTE);
    assert.deepEqual(await backup(), { lastConfirmedAt: first + 75 * SECOND, summary: 'Backup: last confirmed 5 min ago', warning: null });
    at(first + 75 * SECOND + 5 * MINUTE + SECOND);
    assert.deepEqual(await backup(), { lastConfirmedAt: first + 75 * SECOND, summary: 'Backup: last confirmed 5 min ago', warning: OVERDUE });
    at(first + 75 * SECOND + 2 * HOUR);
    assert.deepEqual(await backup(), { lastConfirmedAt: first + 75 * SECOND, summary: 'Backup: last confirmed 2 h ago', warning: OVERDUE });

    // It resumes: the warning goes.
    const resumed = first + 3 * HOUR;
    at(resumed);
    await heartbeat();
    at(resumed + 10 * SECOND);
    assert.deepEqual(await backup(), { lastConfirmedAt: resumed, summary: 'Backup: last confirmed 10 s ago', warning: null });
  },

  /** The restore check's status file beside the database: passed, failed, old, missing, and unreadable. */
  async 'restore-check'() {
    const operator = await signIn('Op Restore', OPERATOR_ID);
    const file = restoreCheckPath()!;
    assert.equal(file, `${env.databasePath}.restore-check.json`, 'beside the database');
    const write = (fields: unknown) => writeFileSync(file, typeof fields === 'string' ? fields : JSON.stringify(fields));
    const iso = (time: number) => new Date(time).toISOString();
    const check = async () => (await statusOf(operator)).restoreCheck;
    const NEVER = 'No restore check has run, so no restore from the backup has been proven.';
    const FAILED = 'The last restore check failed: a restore from the backup may not work.';
    const OLD = 'The last restore check is more than 8 days old: the weekly check may have stopped running.';
    const UNREADABLE = 'The restore check\'s result is unknown: its status file cannot be read.';
    at(T0);

    // Missing: never checked, with the warning.
    assert.deepEqual(await check(), { state: 'never-checked', checkedAt: null, reason: null, summary: 'Restore check: never checked', warning: NEVER });

    // Passed a day ago.
    write({ checkedAt: iso(T0 - DAY), result: 'passed', reason: 'Restored to 2 s before the check; integrity_check ok' });
    assert.deepEqual(await check(), { state: 'passed', checkedAt: T0 - DAY, reason: 'Restored to 2 s before the check; integrity_check ok', summary: 'Restore check: passed 24 h ago', warning: null });

    // Old: exactly 8 days is still fine, a second more is not.
    write({ checkedAt: iso(T0 - 8 * DAY), result: 'passed' });
    assert.deepEqual(await check(), { state: 'passed', checkedAt: T0 - 8 * DAY, reason: null, summary: 'Restore check: passed 8 days ago', warning: null });
    write({ checkedAt: iso(T0 - 8 * DAY - SECOND), result: 'passed', reason: '' });
    assert.deepEqual(await check(), { state: 'passed', checkedAt: T0 - 8 * DAY - SECOND, reason: null, summary: 'Restore check: passed 8 days ago', warning: OLD });

    // Failed, however recent, with its reason; a time with an offset; any other field ignored.
    const failedAt = T0 - 3 * HOUR;
    write({ checkedAt: iso(failedAt + 2 * HOUR).replace('Z', '+02:00'), result: 'failed', reason: '  The restored database failed integrity_check  ', exitCode: 3 });
    assert.deepEqual(await check(), {
      state: 'failed', checkedAt: failedAt, reason: 'The restored database failed integrity_check',
      summary: 'Restore check: failed 3 h ago', warning: FAILED,
    });
    write({ checkedAt: iso(failedAt), result: 'failed', reason: 'x'.repeat(600) });
    assert.equal((await check()).reason, 'x'.repeat(500), 'a long reason is cut');
    write({ checkedAt: iso(failedAt), result: 'failed' });
    assert.deepEqual(await check(), { state: 'failed', checkedAt: failedAt, reason: null, summary: 'Restore check: failed 3 h ago', warning: FAILED });

    // A file that is not the format reads as unreadable, never as passed.
    const unreadable: [unknown, string][] = [
      ['{"checkedAt":', 'it is not JSON'],
      [[{ checkedAt: '2026-11-02T03:00:00Z', result: 'passed' }], 'it is not a JSON object'],
      [{ checkedAt: 'yesterday', result: 'passed' }, 'its checkedAt is not an ISO 8601 time'],
      [{ checkedAt: '2026-11-02 03:00:00', result: 'passed' }, 'its checkedAt is not an ISO 8601 time'],
      [{ checkedAt: Date.parse('2026-11-02T03:00:00Z'), result: 'passed' }, 'its checkedAt is not an ISO 8601 time'],
      [{ checkedAt: '2026-11-02T03:00:00Z', result: 'ok' }, 'its result is not "passed" or "failed"'],
      [{ checkedAt: '2026-11-02T03:00:00Z' }, 'its result is not "passed" or "failed"'],
      [{ checkedAt: '2026-11-02T03:00:00Z', result: 'passed', reason: 42 }, 'its reason is not text'],
    ];
    for (const [fields, problem] of unreadable) {
      write(fields);
      assert.deepEqual(await check(), { state: 'unreadable', checkedAt: null, reason: null, summary: `Restore check: unknown (its status file cannot be read: ${problem})`, warning: UNREADABLE }, problem);
    }

    // Removed again: never checked.
    rmSync(file);
    assert.equal((await check()).state, 'never-checked');
  },

  /** Only the platform operator opens it: signed out 401, a server owner 403 and logged. */
  async access() {
    const operator = await signIn('Op Access', OPERATOR_ID);
    const owner = await signIn('Plain Owner');
    assert.equal((await readStatus()).status, 401);
    const refused = await readStatus(owner);
    assert.deepEqual([refused.status, refused.body], [403, { success: false, error: 'Only the platform operator can do this' }]);
    const allowed = await readStatus(operator);
    assert.deepEqual([allowed.status, allowed.cache], [200, 'no-store']);
    assert.deepEqual(Object.keys(allowed.body).sort(), ['backup', 'gameServers', 'health', 'now', 'restoreCheck']);
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, secrets: [...secrets] } }));
