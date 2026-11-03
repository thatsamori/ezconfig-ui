/**
 * The Supported build through the route handlers (online-platform#27): the
 * platform operator sets it, and polls from any other build are held and
 * answered "not-supported-build" with nothing sent. One scenario per run
 * (argv[2]), each in its own process with the env set by
 * tests/platform-supported-build.test.ts. Polls are held for a short real time
 * (setPollHoldMs); the clock set at reads is moved with setSystemTime.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the Game
 * server keys and names it handled, so the test can check that no log line
 * holds one.
 */
import { setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { GameServerView } from '../../src/lib/platform/game-servers';
import type { SupportedBuild } from '../../src/lib/platform/supported-build';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const { setPollHoldMs } = await import('../../src/lib/platform/polls');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const gameServerRoute = await import('../../src/app/api/game-servers/[id]/route');
const supportedBuildRoute = await import('../../src/app/api/operator/supported-build/route');
const pollRoute = await import('../../src/app/game-server/poll/route');

const scenario = process.argv[2];
const secrets = new Set<string>();
const [OPERATOR_ID, SECOND_OPERATOR_ID] = env.operatorDiscordIds;
const HOLD_MS = 150, HOUR = 3_600_000, DAY = 86_400_000;
const T0 = Math.ceil(Date.now() / HOUR) * HOUR;
const at = (time: number) => setSystemTime(new Date(time));
const SUPPORTED = '20261102-153000', OLDER = '20261020-090000';

async function signIn(name: string, discordId?: string) {
  secrets.add(name);
  return signInForTest(name, discordId);
}
async function registered(session: TestSession, name: string) {
  const response = await gameServersRoute.POST(session.request('/api/game-servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }));
  assert.equal(response.status, 201, `${name} registers`);
  const { data } = await response.json() as { data: { gameServer: GameServerView; key: string } };
  secrets.add(data.key);
  return data;
}
async function viewOf(session: TestSession, id: number): Promise<GameServerView> {
  const response = await gameServerRoute.GET(session.request(`/api/game-servers/${id}`), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function listed(session: TestSession): Promise<GameServerView[]> {
  return (await (await gameServersRoute.GET(session.request('/api/game-servers'))).json()).data;
}

/** A game server polling with its key and a build stamp ('' for none), as the mod sends it. */
async function poll(key: string, buildStamp: string, instanceId = 'instance-one') {
  const started = performance.now();
  const response = await pollRoute.POST(new Request(new URL('/game-server/poll', env.publicUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ buildStamp, instanceId }),
  }));
  return { status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Record<string, unknown>, ms: performance.now() - started };
}
/** Polls and checks it was held for the whole hold, then answered with `answer`. */
async function heldThen(key: string, buildStamp: string, answer: string) {
  const ended = await poll(key, buildStamp);
  assert.deepEqual([ended.status, ended.body, ended.cache], [200, { answer }, 'no-store'], `${buildStamp || 'no stamp'} is answered ${answer}`);
  assert(ended.ms >= HOLD_MS - 10, `held ${ended.ms} ms, like any other poll`);
}

type Answer = { status: number; cache: string | null; body: { supportedBuild?: SupportedBuild | null; success?: boolean; error?: string } };
async function readSetting(session: TestSession): Promise<Answer> {
  const response = await supportedBuildRoute.GET(session.request('/api/operator/supported-build'));
  return { status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() };
}
async function setSetting(session: TestSession, body: unknown, origin = session.origin): Promise<Answer> {
  const response = await supportedBuildRoute.PUT(new Request(new URL('/api/operator/supported-build', env.publicUrl), {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: session.cookie, Origin: origin }, body: JSON.stringify(body),
  }));
  return { status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() };
}
const stored = () => platformStore().all<Record<string, unknown>>('SELECT * FROM supported_build');

const scenarios: Record<string, () => Promise<void>> = {
  /** No Supported build is set: every poll, whatever it reports, is held and answered "not-supported-build". */
  async unset() {
    const owner = await signIn('Owner Unset');
    const { gameServer, key } = await registered(owner, 'Waiting');
    setPollHoldMs(HOLD_MS);
    at(T0);
    assert.deepEqual(stored(), []);

    await heldThen(key, SUPPORTED, 'not-supported-build');
    let view = await viewOf(owner, gameServer.id);
    assert.deepEqual(view.connection, { state: 'connected' }, 'it stays Connected');
    assert.deepEqual(view.needsUpdating, { running: SUPPORTED, supported: null });
    await heldThen(key, SUPPORTED, 'not-supported-build');
    await heldThen(key, '', 'not-supported-build');
    view = await viewOf(owner, gameServer.id);
    assert.deepEqual(view.needsUpdating, { running: null, supported: null });
    assert.deepEqual((await listed(owner))[0].needsUpdating, view.needsUpdating, 'the list shows the same');

    // Held like any other: a newer poll supersedes it.
    const first = poll(key, '');
    await Bun.sleep(40);
    const second = poll(key, '', 'instance-two');
    assert.deepEqual((await first).body, { answer: 'superseded' });
    assert.deepEqual((await second).body, { answer: 'not-supported-build' });
  },

  /** A matching stamp is answered "no-change"; a different stamp, or none, "not-supported-build", logged when the reported build changes. */
  async stamps() {
    const operator = await signIn('Op Stamps', OPERATOR_ID);
    const owner = await signIn('Owner Stamps');
    assert.equal((await setSetting(operator, { stamp: SUPPORTED })).status, 200);
    const { gameServer, key } = await registered(owner, 'Duel');
    const needsUpdating = async () => (await viewOf(owner, gameServer.id)).needsUpdating;
    setPollHoldMs(HOLD_MS);
    at(T0);
    assert.equal(await needsUpdating(), null, 'never connected: nothing reported yet');

    await heldThen(key, SUPPORTED, 'no-change');
    await heldThen(key, SUPPORTED, 'no-change');
    assert.equal(await needsUpdating(), null);

    await heldThen(key, OLDER, 'not-supported-build');
    assert.deepEqual(await needsUpdating(), { running: OLDER, supported: SUPPORTED });
    assert.deepEqual((await viewOf(owner, gameServer.id)).connection, { state: 'connected' }, 'an outdated game server stays Connected');
    await heldThen(key, OLDER, 'not-supported-build');
    await heldThen(key, '', 'not-supported-build');
    assert.deepEqual(await needsUpdating(), { running: null, supported: SUPPORTED });
    await heldThen(key, 'dev build', 'not-supported-build');
    assert.deepEqual(await needsUpdating(), { running: 'dev build', supported: SUPPORTED });
    await heldThen(key, SUPPORTED, 'no-change');
    assert.equal(await needsUpdating(), null);

    // Switched while a poll is held: the poll is answered by the Supported build when its hold ends.
    const held = poll(key, SUPPORTED);
    await Bun.sleep(40);
    assert.equal((await setSetting(operator, { stamp: OLDER })).status, 200);
    assert.deepEqual((await held).body, { answer: 'not-supported-build' });
    assert.deepEqual(await needsUpdating(), { running: SUPPORTED, supported: OLDER });
    await heldThen(key, OLDER, 'no-change');
    assert.equal(await needsUpdating(), null);
  },

  /** Only the platform operator reads and sets it; it is stored with set at and set by, and set by survives the account's deletion as null. */
  async operator() {
    const operator = await signIn('Op Erator', OPERATOR_ID);
    const owner = await signIn('Plain Owner');
    at(T0);
    assert.deepEqual(await readSetting(operator), { status: 200, cache: 'no-store', body: { supportedBuild: null } });

    // A server owner is refused, and so is a change from another site.
    assert.equal((await readSetting(owner)).status, 403);
    assert.deepEqual((await setSetting(owner, { stamp: SUPPORTED })).body, { success: false, error: 'Only the platform operator can do this' });
    assert.equal((await setSetting(operator, { stamp: SUPPORTED }, 'https://elsewhere.example')).status, 403);
    assert.deepEqual(stored(), [], 'nothing stored by a refused request');

    const invalid: [unknown, string][] = [
      [undefined, 'A build stamp is YYYYMMDD-HHMMSS, for example 20261102-153000'],
      ['', 'A build stamp is YYYYMMDD-HHMMSS, for example 20261102-153000'],
      [20261102153000, 'A build stamp is YYYYMMDD-HHMMSS, for example 20261102-153000'],
      ['2026-11-02', 'A build stamp is YYYYMMDD-HHMMSS, for example 20261102-153000'],
      ['20261102-1530', 'A build stamp is YYYYMMDD-HHMMSS, for example 20261102-153000'],
      ['20261102153000', 'A build stamp is YYYYMMDD-HHMMSS, for example 20261102-153000'],
      ['20261302-153000', 'That build stamp is not a real date and time'],
      ['20260230-120000', 'That build stamp is not a real date and time'],
      ['20261102-246000', 'That build stamp is not a real date and time'],
    ];
    for (const [stamp, error] of invalid) {
      const refused = await setSetting(operator, { stamp });
      assert.deepEqual([refused.status, refused.body], [400, { success: false, error }], `${JSON.stringify(stamp)} is refused`);
    }
    assert.equal((await setSetting(operator, 'not an object')).status, 400);
    assert.deepEqual(stored(), []);

    // Set, trimmed, with set at and set by.
    const first = { stamp: SUPPORTED, setAt: T0, setBy: 'Op Erator' };
    assert.deepEqual(await setSetting(operator, { stamp: `  ${SUPPORTED} ` }), { status: 200, cache: 'no-store', body: { supportedBuild: first } });
    assert.deepEqual((await readSetting(operator)).body, { supportedBuild: first });
    assert.deepEqual(stored(), [{ id: 1, stamp: SUPPORTED, set_at: T0, set_by: operator.userId }]);

    // Setting the same stamp again changes nothing: the switch happened at T0.
    at(T0 + 3 * DAY);
    assert.deepEqual((await setSetting(operator, { stamp: SUPPORTED })).body, { supportedBuild: first });

    // Another operator switches it: one row, replaced.
    const second = await signIn('Second Op', SECOND_OPERATOR_ID);
    assert.deepEqual((await setSetting(second, { stamp: OLDER })).body, { supportedBuild: { stamp: OLDER, setAt: T0 + 3 * DAY, setBy: 'Second Op' } });
    assert.deepEqual(stored(), [{ id: 1, stamp: OLDER, set_at: T0 + 3 * DAY, set_by: second.userId }]);

    // Once that account is deleted, set by is null ("a former server owner") and the setting stays.
    platformStore().run('DELETE FROM users WHERE id = ?', second.userId);
    assert.deepEqual((await readSetting(operator)).body, { supportedBuild: { stamp: OLDER, setAt: T0 + 3 * DAY, setBy: null } });
    assert.deepEqual(stored(), [{ id: 1, stamp: OLDER, set_at: T0 + 3 * DAY, set_by: null }]);
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, secrets: [...secrets] } }));
