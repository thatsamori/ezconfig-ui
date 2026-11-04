/**
 * Blocked through the route handlers (online-platform#44): a stored Live
 * configuration holding values the current schema refuses, as a later deploy
 * that tightens a key leaves one. It is never sent: the poll is held and gets
 * "no-change", the server page names the values, it is logged once per
 * platform start, and an Apply of the fixed Draft sends the new one. One
 * scenario per run (argv[2]), each in its own process with the env set by
 * tests/platform-blocked.test.ts, on the Supported build set below.
 * `restarted` runs on the database `blocked` left, as a platform restart does,
 * with the Game server key it printed as argv[3].
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the Live
 * configuration ids Apply made, in order, and the Game server key.
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

const [scenario, storedKey] = process.argv.slice(2);
const SUPPORTED = '20261102-153000';
const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE;
/** The next whole hour: the clock the fixture reads, ahead of the session it signs in with. */
const T0 = Math.ceil(Date.now() / HOUR) * HOUR;
const at = (time: number) => setSystemTime(new Date(time));
const applied: string[] = [];

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

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
/** The Draft as the editor opens it. */
async function opened(session: TestSession, id: number): Promise<{ revision: number; errors: unknown[] }> {
  const response = await draftRoute.GET(session.request(`/api/game-servers/${id}/draft`), params(id));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function save(session: TestSession, id: number, document: unknown): Promise<void> {
  const { revision } = await opened(session, id);
  const response = await draftRoute.PUT(session.request(`/api/game-servers/${id}/draft`, json('PUT', { revision, document })), params(id));
  assert.equal(response.status, 200, 'the Draft saves');
}
async function review(session: TestSession, id: number): Promise<ApplyReview> {
  const response = await applyRoute.GET(session.request(`/api/game-servers/${id}/apply`), params(id));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function apply(session: TestSession, id: number): Promise<Response> {
  const { revision, liveConfigurationId } = await review(session, id);
  return applyRoute.POST(session.request(`/api/game-servers/${id}/apply`, json('POST', { revision, liveConfigurationId })), params(id));
}
/** Apply with a review built just now; resolves to the new Live configuration's id and when it was applied. */
async function applies(session: TestSession, id: number): Promise<{ id: string; appliedAt: number }> {
  const response = await apply(session, id);
  assert.equal(response.status, 200, 'Apply goes through');
  const { data } = await response.json();
  applied.push(data.liveConfigurationId);
  return { id: data.liveConfigurationId, appliedAt: data.appliedAt };
}

type Command = { database: string; category: string; values: string };
type Answer = { answer: string; liveConfigurationId?: string; commands?: Command[] };
const report = (fields: Record<string, unknown> = {}) => ({ buildStamp: SUPPORTED, instanceId: 'instance-a', processed: null, ...fields });
const succeeded = (liveConfigurationId: string) => ({ liveConfigurationId, result: { success: true, acceptedValues: 2, changedValues: 2, unknownKeys: [], failure: null } });
/** A game server polling, as the mod sends it. */
async function poll(key: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; body: Answer; ms: number }> {
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

const DOCUMENT = { Character: { MaxWalkSpeed: 450 }, Weapon: { ArmingSword: { Strike: { Windup: 0.5 } } } };
const COMMANDS = [
  { database: 'Character', category: 'Movement', values: '{"MaxWalkSpeed":"450.00"}' },
  { database: 'ArmingSword', category: 'Strike', values: '{"Windup":"0.50"}' },
];
/**
 * DOCUMENT as a deploy that tightened two keys finds it: a whole number where
 * a fraction was allowed, and a smaller range. A value the schema has no place
 * for (a retired key) is never sent, so it does not block.
 */
const TIGHTENED = { Character: { MaxWalkSpeed: 450, CustomFOVMax: 120.5, FreeStunDuration: -1, RetiredKey: 3 }, Weapon: DOCUMENT.Weapon };
const REFUSED = [
  { database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: 'Use a whole number.' },
  { database: 'Character', category: 'Stun', key: 'FreeStunDuration', error: 'Use a finite value of 0 or more.' },
];
const FIXED = { Character: { MaxWalkSpeed: 450, CustomFOVMax: 120, FreeStunDuration: 0 }, Weapon: DOCUMENT.Weapon };
const FIXED_COMMANDS = [
  { database: 'Character', category: 'Camera', values: '{"CustomFOVMax":"120"}' },
  COMMANDS[0],
  { database: 'Character', category: 'Stun', values: '{"FreeStunDuration":"0"}' },
  COMMANDS[1],
];

/** What a deploy that tightens keys leaves: the stored Live configuration and Draft, never rewritten, now hold values the schema refuses. */
function tighten(id: number) {
  platformStore().run('UPDATE live_configurations SET overrides = ? WHERE game_server_id = ?', JSON.stringify(TIGHTENED), id);
  platformStore().run('UPDATE drafts SET overrides = ? WHERE game_server_id = ?', JSON.stringify(TIGHTENED), id);
}

const scenarios: Record<string, () => Promise<void>> = {
  async blocked() {
    platformStore().run('INSERT INTO supported_build (id, stamp, set_at) VALUES (1, ?, 0)', SUPPORTED);
    const owner = await signInForTest();
    const created = await gameServersRoute.POST(owner.request('/api/game-servers', json('POST', { name: 'Duel EU' })));
    const { gameServer: { id }, key } = (await created.json()).data as { gameServer: { id: number }; key: string };
    await save(owner, id, DOCUMENT);
    setPollHoldMs(60_000);
    at(T0);
    let game = await held(key, id, report());
    at(T0 + MINUTE);
    const live = await applies(owner, id);
    assert.deepEqual((await game.answered).body, { answer: 'live-configuration', liveConfigurationId: live.id, commands: COMMANDS });
    at(T0 + MINUTE + 2 * SECOND);
    await getsNothing(key, report({ processed: succeeded(live.id) }), 'processed');
    const confirmed = { ...live, state: 'confirmed', reportedAt: T0 + MINUTE + 2 * SECOND, ignoredKeys: [] };
    assert.deepEqual(await stateOf(owner, id), confirmed);

    tighten(id);
    // Confirmed stays as reported: the game server runs it, and a restart reporting it is sent nothing.
    at(T0 + 5 * MINUTE);
    await getsNothing(key, report({ instanceId: 'instance-b', processed: succeeded(live.id) }), 'a restart reporting the Live configuration');
    assert.deepEqual(await stateOf(owner, id), confirmed, 'still Confirmed');

    // A build change: the mod reports no id. Blocked: held, never answered 500 or at once, and the page names the values.
    at(T0 + 6 * MINUTE);
    await getsNothing(key, report({ instanceId: 'instance-c' }), 'a Blocked Live configuration is not sent');
    await getsNothing(key, report({ instanceId: 'instance-c' }), 'nor at the next poll');
    const blocked = { ...live, state: 'blocked', refusedValues: REFUSED };
    const page = await viewOf(owner, id);
    assert.deepEqual([page.connection.state, page.liveConfiguration], ['connected', blocked], 'Blocked beside Connected');
    // The editor opens the Draft with the values to fix marked, and Apply is refused until they are fixed.
    assert.deepEqual((await opened(owner, id)).errors, REFUSED, 'the Draft opens with the refused values named');
    assert.deepEqual((await review(owner, id)).errors, REFUSED);
    game = await held(key, id, report({ instanceId: 'instance-c' }));
    const refused = await apply(owner, id);
    assert.deepEqual([refused.status, (await refused.json()).details], [400, REFUSED], 'Apply is refused while the Draft holds them');
    assert.deepEqual(await stateOf(owner, id), blocked);

    // Fixed in the Draft, Apply wakes the held poll with the new Live configuration.
    await save(owner, id, FIXED);
    assert.deepEqual((await opened(owner, id)).errors, []);
    at(T0 + 7 * MINUTE);
    const next = await applies(owner, id);
    assert.deepEqual((await game.answered).body, { answer: 'live-configuration', liveConfigurationId: next.id, commands: FIXED_COMMANDS });
    assert.deepEqual(await stateOf(owner, id), { ...next, state: 'pending' });
    at(T0 + 7 * MINUTE + 2 * SECOND);
    await getsNothing(key, report({ instanceId: 'instance-c', processed: succeeded(next.id) }), 'processed');
    assert.deepEqual(await stateOf(owner, id), { ...next, state: 'confirmed', reportedAt: T0 + 7 * MINUTE + 2 * SECOND, ignoredKeys: [] });

    // Left Blocked for the restart: the fixed one tightened in turn.
    tighten(id);
    await getsNothing(key, report({ instanceId: 'instance-d' }), 'Blocked again');
    console.log(JSON.stringify({ fixture: { scenario, applied, key } }));
  },

  /** A Live configuration whose release curve the rules refuse (stab-curve-keys#04): a stored bad shape or the key in a strike Blocks it the same way. */
  async releaseCurve() {
    platformStore().run('INSERT INTO supported_build (id, stamp, set_at) VALUES (1, ?, 0)', SUPPORTED);
    const owner = await signInForTest();
    const created = await gameServersRoute.POST(owner.request('/api/game-servers', json('POST', { name: 'Duel EU' })));
    const { gameServer: { id }, key } = (await created.json()).data as { gameServer: { id: number }; key: string };
    const FAST_START = [0, 0, 0.2, 0.9, 1, 1];
    const GOOD = { Weapon: { Longsword: { Stab: { ReleaseCurve: FAST_START } } } };
    const GOOD_COMMANDS = [{ database: 'Longsword', category: 'Stab', values: '{"ReleaseCurve":"0.00,0.00,0.20,0.90,1.00,1.00"}' }];
    await save(owner, id, GOOD);
    setPollHoldMs(60_000);
    at(T0);
    let game = await held(key, id, report());
    at(T0 + MINUTE);
    const live = await applies(owner, id);
    assert.deepEqual((await game.answered).body, { answer: 'live-configuration', liveConfigurationId: live.id, commands: GOOD_COMMANDS }, 'a good curve is delivered as the mod takes it');
    at(T0 + MINUTE + 2 * SECOND);
    await getsNothing(key, report({ processed: succeeded(live.id) }), 'processed');

    const OLDER = { Weapon: { Longsword: { Stab: { ReleaseCurve: [0, 0, 0.5, 0.5] }, Strike: { ReleaseCurve: FAST_START }, AltStab: { ReleaseCurve: [0, 0, 0.205, 0.9, 1, 1] } } } };
    const REFUSED_CURVES = [
      { database: 'Longsword', category: 'Stab', key: 'ReleaseCurve', error: 'End the curve at (1,1).' },
      { database: 'Longsword', category: 'Strike', key: 'ReleaseCurve', error: 'Use this key only in Stab and AltStab.' },
      { database: 'Longsword', category: 'AltStab', key: 'ReleaseCurve', error: 'Use values on the 0.01 grid; 0.205 is not.' },
    ];
    platformStore().run('UPDATE live_configurations SET overrides = ? WHERE game_server_id = ?', JSON.stringify(OLDER), id);
    platformStore().run('UPDATE drafts SET overrides = ? WHERE game_server_id = ?', JSON.stringify(OLDER), id);

    // A build change: the mod reports no id, and is sent nothing. The page and the Draft name the values with their reasons, and Apply is refused.
    at(T0 + 6 * MINUTE);
    await getsNothing(key, report({ instanceId: 'instance-c' }), 'a Blocked Live configuration is not sent');
    assert.deepEqual((await viewOf(owner, id)).liveConfiguration, { ...live, state: 'blocked', refusedValues: REFUSED_CURVES });
    assert.deepEqual((await opened(owner, id)).errors, REFUSED_CURVES, 'the Draft opens with the refused values named');
    assert.deepEqual((await review(owner, id)).errors, REFUSED_CURVES);
    game = await held(key, id, report({ instanceId: 'instance-c' }));
    const refused = await apply(owner, id);
    assert.deepEqual([refused.status, (await refused.json()).details], [400, REFUSED_CURVES], 'Apply is refused while the Draft holds them');

    // Fixed in the Draft, Apply wakes the held poll with the new Live configuration.
    await save(owner, id, GOOD);
    assert.deepEqual((await opened(owner, id)).errors, []);
    at(T0 + 7 * MINUTE);
    const next = await applies(owner, id);
    assert.deepEqual((await game.answered).body, { answer: 'live-configuration', liveConfigurationId: next.id, commands: GOOD_COMMANDS });
    console.log(JSON.stringify({ fixture: { scenario, applied, key } }));
  },

  /** After a restart: the same Blocked Live configuration is logged once more, then not again. */
  async restarted() {
    assert(storedKey, 'the key `blocked` printed');
    await getsNothing(storedKey, report({ instanceId: 'instance-e' }), 'still Blocked after a restart');
    await getsNothing(storedKey, report({ instanceId: 'instance-e' }), 'and at the next poll');
    console.log(JSON.stringify({ fixture: { scenario, applied } }));
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
