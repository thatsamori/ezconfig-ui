/**
 * Confirmed, Failed and Pending through the route handlers: the Live
 * configuration's state computed from the game server's last report, as the
 * server list and page read it, and the re-delivery rules it rests on (a
 * report of no id gets the whole Live configuration again; a report of the
 * current id gets nothing, Failed included, until an Apply). One scenario per
 * run (argv[2]), each in its own process with the env set by
 * tests/platform-confirmed-failed.test.ts, on the Supported build set below.
 * Polls are held for a short real time (setPollHoldMs); the clock that
 * connection status and report times read is moved with setSystemTime.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the Live
 * configuration ids Apply made, in order, for the test to check the log.
 */
import { setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { GameServerView } from '../../src/lib/platform/game-servers';
import type { ApplyReview } from '../../src/lib/platform/live-configurations';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const { pollActivity, setPollHoldMs } = await import('../../src/lib/platform/polls');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const gameServerRoute = await import('../../src/app/api/game-servers/[id]/route');
const draftRoute = await import('../../src/app/api/game-servers/[id]/draft/route');
const applyRoute = await import('../../src/app/api/game-servers/[id]/apply/route');
const pollRoute = await import('../../src/app/game-server/poll/route');

const scenario = process.argv[2];
const SUPPORTED = '20261102-153000';
const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE;
/** The next whole hour: the clock the fixture reads, ahead of the session it signs in with. */
const T0 = Math.ceil(Date.now() / HOUR) * HOUR;
const at = (time: number) => setSystemTime(new Date(time));
platformStore().run('INSERT INTO supported_build (id, stamp, set_at) VALUES (1, ?, 0)', SUPPORTED);
/** The Live configuration ids Apply answered with, in order. */
const applied: string[] = [];

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function registered(session: TestSession, name: string): Promise<{ id: number; key: string }> {
  const response = await gameServersRoute.POST(session.request('/api/game-servers', json('POST', { name })));
  assert.equal(response.status, 201);
  const { gameServer, key } = (await response.json()).data;
  return { id: gameServer.id, key };
}
/** The game server as its page and the server list read it. */
async function viewOf(session: TestSession, id: number): Promise<GameServerView> {
  const response = await gameServerRoute.GET(session.request(`/api/game-servers/${id}`), params(id));
  assert.equal(response.status, 200);
  const view: GameServerView = (await response.json()).data;
  const listed: GameServerView[] = (await (await gameServersRoute.GET(session.request('/api/game-servers'))).json()).data;
  assert.deepEqual(listed.find(server => server.id === id)?.liveConfiguration, view.liveConfiguration, 'the server list shows the same state');
  return view;
}
const stateOf = async (session: TestSession, id: number) => (await viewOf(session, id)).liveConfiguration;
async function save(session: TestSession, id: number, document: unknown): Promise<void> {
  const { revision } = (await (await draftRoute.GET(session.request(`/api/game-servers/${id}/draft`), params(id))).json()).data;
  const response = await draftRoute.PUT(session.request(`/api/game-servers/${id}/draft`, json('PUT', { revision, document })), params(id));
  assert.equal(response.status, 200, 'the Draft saves');
}
async function review(session: TestSession, id: number): Promise<ApplyReview> {
  const response = await applyRoute.GET(session.request(`/api/game-servers/${id}/apply`), params(id));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
/** Apply with a review built just now; resolves to the new Live configuration's id and when it was applied. */
async function apply(session: TestSession, id: number): Promise<{ id: string; appliedAt: number }> {
  const { revision, liveConfigurationId } = await review(session, id);
  const response = await applyRoute.POST(session.request(`/api/game-servers/${id}/apply`, json('POST', { revision, liveConfigurationId })), params(id));
  assert.equal(response.status, 200, 'Apply goes through');
  const { data } = await response.json();
  applied.push(data.liveConfigurationId);
  return { id: data.liveConfigurationId, appliedAt: data.appliedAt };
}

type Command = { database: string; category: string; values: string };
type Answer = { answer: string; liveConfigurationId?: string; commands?: Command[] };
type Polled = { status: number; body: Answer; ms: number };
const report = (fields: Record<string, unknown> = {}) => ({ buildStamp: SUPPORTED, instanceId: 'instance-a', processed: null, ...fields });
const UNKNOWN_KEYS = [{ database: 'Character', category: 'Movement', key: 'RetiredKey' }, { database: 'ArmingSword', category: 'Strike', key: 'FutureKey' }];
const succeeded = (liveConfigurationId: string, unknownKeys: unknown[] = []) => ({ liveConfigurationId, result: { success: true, acceptedValues: 4, changedValues: 4, unknownKeys, failure: null } });
const STRIKE_FAILURE = { database: 'ArmingSword', category: 'Strike', error: 'COULD NOT PARSE DATA TYPE FOR KEY: Windup' };
const WIPE_FAILURE = { database: '', category: '', error: 'The wipe failed' };
const failed = (liveConfigurationId: string, failure = STRIKE_FAILURE) => ({ liveConfigurationId, result: { success: false, acceptedValues: 3, changedValues: 3, unknownKeys: [], failure } });
/** A game server polling, as the mod sends it. */
async function poll(key: string, body: unknown, signal?: AbortSignal): Promise<Polled> {
  const started = performance.now();
  const response = await pollRoute.POST(new Request(new URL('/game-server/poll', env.publicUrl), {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as Answer, ms: performance.now() - started };
}
/** A poll that is held: resolves once it is, with its answer to come and a way to hang it up. */
async function held(key: string, id: number, body: unknown) {
  const connection = new AbortController();
  const answered = poll(key, body, connection.signal);
  for (let tries = 0; !pollActivity(id).held; tries++) {
    assert(tries < 500, 'the poll is held');
    await Bun.sleep(1);
  }
  return { answered, hangUp: async () => { connection.abort(); await answered; } };
}
/** Polls with a short hold and asserts it is held and gets nothing: "no-change". */
async function getsNothing(key: string, body: unknown, why: string) {
  setPollHoldMs(100);
  const polled = await poll(key, body);
  assert.deepEqual([polled.status, polled.body], [200, { answer: 'no-change' }], why);
  assert(polled.ms >= 90, `${why}: held`);
  setPollHoldMs(60_000);
}
/** Polls and asserts it gets the whole Live configuration at once, never held. */
async function getsAtOnce(key: string, body: unknown, live: string, commands: Command[], why: string) {
  const polled = await poll(key, body);
  assert.deepEqual([polled.status, polled.body], [200, { answer: 'live-configuration', liveConfigurationId: live, commands }], why);
  assert(polled.ms < 1_000, `${why}: answered at once`);
}

const DOCUMENT = { Character: { MaxWalkSpeed: 450, CanDodge: false }, Weapon: { ArmingSword: { Strike: { Windup: 0.5 } } } };
const COMMANDS = [
  { database: 'Character', category: 'Movement', values: '{"MaxWalkSpeed":"450.00","CanDodge":"False"}' },
  { database: 'ArmingSword', category: 'Strike', values: '{"Windup":"0.50"}' },
];
const CHANGED = { ...DOCUMENT, Character: { MaxWalkSpeed: 460, CanDodge: false } };
const CHANGED_COMMANDS = [{ ...COMMANDS[0], values: '{"MaxWalkSpeed":"460.00","CanDodge":"False"}' }, COMMANDS[1]];

/** A game server with a Draft, polling on the Supported build, and its first Apply delivered at `T0 + MINUTE`. */
async function firstApply() {
  const owner = await signInForTest();
  const { id, key } = await registered(owner, 'Duel EU');
  await save(owner, id, DOCUMENT);
  setPollHoldMs(60_000);
  at(T0);
  assert.equal(await stateOf(owner, id), null, 'no Live configuration, so no state, before the first Apply');
  const game = await held(key, id, report());
  at(T0 + MINUTE);
  const live = await apply(owner, id);
  assert.deepEqual((await game.answered).body, { answer: 'live-configuration', liveConfigurationId: live.id, commands: COMMANDS });
  assert.deepEqual(await stateOf(owner, id), { ...live, state: 'pending' }, 'Pending until the game server reports processing it');
  return { owner, id, key, live };
}

const scenarios: Record<string, () => Promise<void>> = {
  async confirmed() {
    const { owner, id, key, live } = await firstApply();
    // Processed, every command succeeded: Confirmed, as of the poll that reported it.
    at(T0 + MINUTE + 2 * SECOND);
    let game = await held(key, id, report({ processed: succeeded(live.id) }));
    const confirmed = { ...live, state: 'confirmed', reportedAt: T0 + MINUTE + 2 * SECOND, ignoredKeys: [] };
    assert.deepEqual(await stateOf(owner, id), confirmed);
    // Reported on every later poll, past the 5 minutes an unchanged poll writes its time: still Confirmed as of the first.
    await game.hangUp();
    at(T0 + 10 * MINUTE);
    game = await held(key, id, report({ processed: succeeded(live.id) }));
    assert.deepEqual(await stateOf(owner, id), confirmed);
    // Connection is its own indicator: Not connected, and still Confirmed.
    await game.hangUp();
    at(T0 + 11 * MINUTE);
    const away = await viewOf(owner, id);
    assert.deepEqual([away.connection, away.liveConfiguration], [{ state: 'not-connected', lastSeenAt: T0 + 10 * MINUTE }, confirmed]);

    // A success that skipped keys the game server's build does not know: Confirmed, with a warning naming them.
    at(T0 + 12 * MINUTE);
    game = await held(key, id, report({ processed: succeeded(live.id) }));
    await save(owner, id, CHANGED);
    const next = await apply(owner, id);
    assert.deepEqual((await game.answered).body, { answer: 'live-configuration', liveConfigurationId: next.id, commands: CHANGED_COMMANDS });
    assert.deepEqual(await stateOf(owner, id), { ...next, state: 'pending' }, 'it reports processing the earlier Apply: Pending');
    at(T0 + 12 * MINUTE + 3 * SECOND);
    game = await held(key, id, report({ processed: succeeded(next.id, UNKNOWN_KEYS) }));
    assert.deepEqual(await stateOf(owner, id), { ...next, state: 'confirmed', reportedAt: T0 + 12 * MINUTE + 3 * SECOND, ignoredKeys: UNKNOWN_KEYS });
    // The last report itself is shown as reported.
    assert.deepEqual((await viewOf(owner, id)).lastReport, { buildStamp: SUPPORTED, processed: succeeded(next.id, UNKNOWN_KEYS) });
    await game.hangUp();
  },

  async failed() {
    const { owner, id, key, live } = await firstApply();
    // Processing stopped at a failed command: Failed, naming where and the mod's error.
    at(T0 + MINUTE + 5 * SECOND);
    await getsNothing(key, report({ processed: failed(live.id) }), 'a Failed configuration is not sent again');
    const failedState = { ...live, state: 'failed', reportedAt: T0 + MINUTE + 5 * SECOND, failure: STRIKE_FAILURE };
    assert.deepEqual(await stateOf(owner, id), failedState);
    // Never resent on its own: not after a restart or map change either, which reports the same.
    at(T0 + 2 * MINUTE);
    await getsNothing(key, report({ instanceId: 'instance-b', processed: failed(live.id) }), 'nor after a restart');
    assert.deepEqual(await stateOf(owner, id), failedState, 'Failed as of its first report');
    // "Failed, and now Not connected" shows both.
    at(T0 + 3 * MINUTE);
    const away = await viewOf(owner, id);
    assert.deepEqual([away.connection.state, away.liveConfiguration], ['not-connected', failedState]);

    // A build change: the mod reports no id, and gets the whole Live configuration again. Processing stopped at the wipe this time.
    await getsAtOnce(key, report({ processed: null }), live.id, COMMANDS, 'a report of no id');
    assert.deepEqual(await stateOf(owner, id), { ...live, state: 'pending' });
    at(T0 + 3 * MINUTE + 2 * SECOND);
    const game = await held(key, id, report({ processed: failed(live.id, WIPE_FAILURE) }));
    assert.deepEqual(await stateOf(owner, id), { ...live, state: 'failed', reportedAt: T0 + 3 * MINUTE + 2 * SECOND, failure: WIPE_FAILURE });

    // The recovery: Apply with no changes sends the same configuration again, under a new id.
    assert.deepEqual(await review(owner, id).then(({ added, changed, reset }) => [added, changed, reset]), [[], [], []]);
    at(T0 + 4 * MINUTE);
    const again = await apply(owner, id);
    assert.notEqual(again.id, live.id);
    assert.deepEqual((await game.answered).body, { answer: 'live-configuration', liveConfigurationId: again.id, commands: COMMANDS });
    assert.deepEqual(await stateOf(owner, id), { ...again, state: 'pending' });
    at(T0 + 4 * MINUTE + 2 * SECOND);
    const settled = await held(key, id, report({ processed: succeeded(again.id) }));
    assert.deepEqual(await stateOf(owner, id), { ...again, state: 'confirmed', reportedAt: T0 + 4 * MINUTE + 2 * SECOND, ignoredKeys: [] });
    await settled.hangUp();
  },

  async pending() {
    const { owner, id, key, live } = await firstApply();
    // An id the platform does not know, well-formed or not: Pending, and it gets the Live configuration at once.
    for (const unknown of ['0b5e8f8e-4a4c-4c39-9a51-5c3f2b0e7d11', 'not-a-real-id']) {
      await getsAtOnce(key, report({ processed: succeeded(unknown) }), live.id, COMMANDS, unknown);
      assert.deepEqual(await stateOf(owner, id), { ...live, state: 'pending' }, unknown);
    }
    // An earlier Apply's id: Pending too, and it gets the newer one at once.
    at(T0 + 2 * MINUTE);
    const game = await held(key, id, report({ processed: succeeded(live.id) }));
    assert.equal((await stateOf(owner, id))?.state, 'confirmed');
    await save(owner, id, CHANGED);
    const next = await apply(owner, id);
    assert.equal((await game.answered).body.liveConfigurationId, next.id);
    await getsAtOnce(key, report({ processed: succeeded(live.id) }), next.id, CHANGED_COMMANDS, 'an earlier id');
    assert.deepEqual(await stateOf(owner, id), { ...next, state: 'pending' });
    // A failure reported for an earlier id is not this configuration's: still Pending.
    await getsAtOnce(key, report({ processed: failed(live.id) }), next.id, CHANGED_COMMANDS, 'an earlier id that failed');
    assert.deepEqual(await stateOf(owner, id), { ...next, state: 'pending' });
  },

  async redelivery() {
    const { owner, id, key, live } = await firstApply();
    at(T0 + MINUTE + 2 * SECOND);
    await getsNothing(key, report({ processed: succeeded(live.id) }), 'a report of the current id');
    assert.equal((await stateOf(owner, id))?.state, 'confirmed');
    // A restart or map change: a new instance reporting the current id gets nothing.
    at(T0 + 5 * MINUTE);
    await getsNothing(key, report({ instanceId: 'instance-b', processed: succeeded(live.id) }), 'a restart reporting the current id');
    assert.deepEqual(await stateOf(owner, id), { ...live, state: 'confirmed', reportedAt: T0 + MINUTE + 2 * SECOND, ignoredKeys: [] });
    // The mod's build changed: it reports no id, and gets the whole Live configuration again at once. Pending until it reports processing it.
    at(T0 + 6 * MINUTE);
    await getsAtOnce(key, report({ instanceId: 'instance-c', processed: null }), live.id, COMMANDS, 'a report of no id');
    assert.deepEqual(await stateOf(owner, id), { ...live, state: 'pending' });
    // Reported again: Confirmed as of this report.
    at(T0 + 6 * MINUTE + 2 * SECOND);
    await getsNothing(key, report({ instanceId: 'instance-c', processed: succeeded(live.id) }), 'processed again');
    assert.deepEqual(await stateOf(owner, id), { ...live, state: 'confirmed', reportedAt: T0 + 6 * MINUTE + 2 * SECOND, ignoredKeys: [] });
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, applied } }));
