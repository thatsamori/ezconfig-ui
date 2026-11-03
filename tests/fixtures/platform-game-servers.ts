/**
 * Registering game servers, the poll exchange and connection status,
 * regenerating a key, deleting a game server and the shared-key warning, through
 * the route handlers. One scenario per run (argv[2]), each in its own process
 * with the env set by tests/platform-game-servers.test.ts. Polls are held for
 * a short real time (setPollHoldMs); the clock that connection status reads is
 * moved with setSystemTime.
 *
 * These polls run the Supported build, set before any scenario starts;
 * tests/fixtures/platform-supported-build.ts covers any other build.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the Game
 * server keys it handled, so the test can check that no log line holds one.
 */
import { setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { GameServerView } from '../../src/lib/platform/game-servers';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const { setPollHoldMs } = await import('../../src/lib/platform/polls');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const gameServerRoute = await import('../../src/app/api/game-servers/[id]/route');
const regenerateKeyRoute = await import('../../src/app/api/game-servers/[id]/regenerate-key/route');
const pollRoute = await import('../../src/app/game-server/poll/route');

const scenario = process.argv[2];
const keys = new Set<string>();
let handover: Record<string, unknown> | undefined;
const SECOND = 1000, MINUTE = 60_000, HOUR = 3_600_000;
const KEY = /^ezc_gsk_[A-Za-z0-9_-]{43}$/;
const handedOver = process.env.EZ_FIXTURE_HANDOVER ? JSON.parse(process.env.EZ_FIXTURE_HANDOVER) as { cookie: string; id: number; t0: number } : undefined;
/** The next whole hour (or the first run's, after a restart): the clock connection status reads, ahead of the session the test signed in with. */
const T0 = handedOver?.t0 ?? Math.ceil(Date.now() / HOUR) * HOUR;
const at = (time: number) => setSystemTime(new Date(time));
// The stamp report() sends; a restart's second run finds it already set.
platformStore().run("INSERT OR IGNORE INTO supported_build (id, stamp, set_at) VALUES (1, '20261102-153000', 0)");

async function register(session: TestSession, name: unknown) {
  const response = await gameServersRoute.POST(session.request('/api/game-servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }));
  const body = await response.json() as { success: boolean; error?: string; data?: { gameServer: GameServerView; key: string } };
  if (body.data?.key) keys.add(body.data.key);
  return { status: response.status, cache: response.headers.get('Cache-Control'), body };
}
async function registered(session: TestSession, name: string) {
  const { status, body } = await register(session, name);
  assert.equal(status, 201, `${name} registers`);
  return body.data!;
}
async function list(session: TestSession): Promise<GameServerView[]> {
  const response = await gameServersRoute.GET(session.request('/api/game-servers'));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function read(session: TestSession, id: number | string) {
  const response = await gameServerRoute.GET(session.request(`/api/game-servers/${id}`), { params: Promise.resolve({ id: String(id) }) });
  return { status: response.status, body: await response.json() as { success: boolean; data?: GameServerView; error?: string } };
}
async function viewOf(session: TestSession, id: number): Promise<GameServerView> {
  const { status, body } = await read(session, id);
  assert.equal(status, 200);
  return body.data!;
}
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
async function regenerateKey(session: TestSession, id: number | string) {
  const response = await regenerateKeyRoute.POST(session.request(`/api/game-servers/${id}/regenerate-key`, { method: 'POST' }), params(id));
  const body = await response.json() as { success: boolean; error?: string; data?: { gameServer: GameServerView; key: string } };
  if (body.data?.key) keys.add(body.data.key);
  return { status: response.status, cache: response.headers.get('Cache-Control'), body };
}
async function remove(session: TestSession, id: number | string) {
  const response = await gameServerRoute.DELETE(session.request(`/api/game-servers/${id}`, { method: 'DELETE' }), params(id));
  return { status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as { success: boolean; error?: string } };
}
/** The owner's cookie, sent from another site. */
const crossSite = (session: TestSession, url: string, method: string) =>
  new Request(new URL(url, env.publicUrl), { method, headers: { Cookie: session.cookie, Origin: 'https://elsewhere.example' } });
const NOT_THEIRS = { status: 404, cache: 'no-store', body: { success: false, error: 'No such game server' } };

type PollOptions = { authorization?: string | null; body?: string | ReadableStream<Uint8Array>; signal?: AbortSignal };
/** A game server polling: POST with its key as a Bearer token, as the mod sends it. */
async function poll(key: string, report: unknown, { authorization = `Bearer ${key}`, body = JSON.stringify(report), signal }: PollOptions = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (authorization !== null) headers.set('Authorization', authorization);
  const started = performance.now();
  const response = await pollRoute.POST(new Request(new URL('/game-server/poll', env.publicUrl), { method: 'POST', headers, body, signal }));
  return { status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Record<string, unknown>, ms: performance.now() - started };
}
const report = (fields: Record<string, unknown> = {}) => ({ buildStamp: '20261102-153000', instanceId: '8F2C9A41B7D34E0F9C1A2B3C4D5E6F70', ...fields });
/** A poll whose body is still arriving: its key has been looked up, and the rest of the body comes with `finish()`. */
function slowPoll(key: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(report()));
  let finish = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 8));
      finish = () => { controller.enqueue(bytes.subarray(8)); controller.close(); };
    },
  });
  return { answered: poll(key, undefined, { body }), finish: () => finish() };
}

/** Every row of every table, to check what a delete removed. */
function everyRow(): Record<string, Record<string, unknown>[]> {
  const store = platformStore();
  const tables = store.all<{ name: string }>("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return Object.fromEntries(tables.map(({ name }) => [name, store.all<Record<string, unknown>>(`SELECT * FROM "${name}" ORDER BY rowid`)]));
}
/** The columns of `table` that reference a game server. */
const gameServerColumns = (table: string) =>
  platformStore().all<{ table: string; from: string }>('SELECT "table", "from" FROM pragma_foreign_key_list(?)', table).filter(key => key.table === 'game_servers').map(key => key.from);
const SUCCESS = { success: true, acceptedValues: 140, changedValues: 12, unknownKeys: [{ database: 'ArmingSword', category: 'Strike', key: 'RetiredKey' }] };

/** The bytes of the database and its write-ahead log. */
function storedBytes() {
  return [env.databasePath, `${env.databasePath}-wal`].filter(existsSync).map(path => readFileSync(path).toString('latin1')).join('');
}
function assertNoKeyStored() {
  const bytes = storedBytes();
  assert(keys.size > 0);
  for (const key of keys) assert(!bytes.includes(key), 'the database never holds a Game server key');
}

const scenarios: Record<string, () => Promise<void>> = {
  async register() {
    const [owner, other] = [await signInForTest('Owner A'), await signInForTest('Owner B')];
    at(T0);
    const first = await register(owner, 'Duel EU');
    assert.equal(first.status, 201);
    assert.equal(first.cache, 'no-store');
    const { gameServer, key } = first.body.data!;
    assert.match(key, KEY);
    assert.equal(key.length, 51);
    assert.equal(Buffer.from(key.slice('ezc_gsk_'.length), 'base64url').length, 32, '32 random bytes');
    assert.deepEqual(gameServer, { id: gameServer.id, name: 'Duel EU', keyLast4: key.slice(-4), registeredAt: T0, connection: { state: 'never-connected' }, sharedKey: false, lastReport: null, needsUpdating: null });

    // Unique per owner, ignoring case (and around the name).
    for (const name of ['Duel EU', 'duel eu', '  DUEL eu  ']) {
      const duplicate = await register(owner, name);
      assert.equal(duplicate.status, 409, `"${name}" is taken`);
      assert.deepEqual(duplicate.body, { success: false, error: 'You already have a game server called Duel EU' });
    }
    await registered(owner, 'Ärger');
    assert.equal((await register(owner, 'ärger')).status, 409, 'case is ignored beyond ASCII too');
    assert.equal((await register(owner, 'ÄRGER')).status, 409, 'and whatever the Unicode form');
    const longest = await registered(owner, 'x'.repeat(64));
    const elsewhere = await registered(other, 'duel eu');
    assert.notEqual(elsewhere.key, key, 'another owner may use the same name, with its own key');

    const invalid: [unknown, string][] = [
      ['', 'Give the game server a name'], ['   ', 'Give the game server a name'], [undefined, 'Give the game server a name'], [42, 'Give the game server a name'],
      ['x'.repeat(65), 'Keep the name to 64 characters or fewer'], ['Duel\tEU', 'The name cannot contain control characters'],
    ];
    for (const [name, error] of invalid) assert.deepEqual((await register(owner, name)).body, { success: false, error }, `${JSON.stringify(name)} is refused`);
    const crossSite = await gameServersRoute.POST(new Request(new URL('/api/game-servers', env.publicUrl), { method: 'POST', headers: { Cookie: owner.cookie, Origin: 'https://elsewhere.example' }, body: '{"name":"Sneaky"}' }));
    assert.equal(crossSite.status, 403);

    // Each owner lists only their own, by name; reading another owner's reads as missing.
    const listed = await list(owner);
    assert.deepEqual(listed.map(server => server.name), ['Duel EU', 'x'.repeat(64), 'Ärger']);
    assert.deepEqual((await list(other)).map(server => server.name), ['duel eu']);
    assert.deepEqual(await viewOf(owner, gameServer.id), gameServer);
    assert.deepEqual(listed.find(server => server.id === gameServer.id), gameServer);
    for (const id of [elsewhere.gameServer.id, 9999, 'abc', '0', '-1']) assert.deepEqual(await read(owner, id), { status: 404, body: { success: false, error: 'No such game server' } });

    // Shown once: no later response holds a key.
    const later = JSON.stringify([listed, await list(other), await viewOf(owner, longest.gameServer.id)]);
    for (const shown of keys) assert(!later.includes(shown), 'the key is never returned again');

    // Each has an empty Draft. (Read from the table until the Draft has routes, online-platform#30.)
    const drafts = platformStore().all<Record<string, unknown>>('SELECT * FROM drafts ORDER BY game_server_id');
    assert.equal(drafts.length, 4);
    for (const draft of drafts) assert.deepEqual({ ...draft, game_server_id: 0 }, { game_server_id: 0, overrides: '{}', revision: 0, saved_at: null });

    // At rest: only each key's hash and last 4 characters.
    const stored = platformStore().all<{ key_hash: string; key_last4: string }>('SELECT key_hash, key_last4 FROM game_servers ORDER BY id');
    assert.deepEqual(stored, [...keys].map(shown => ({ key_hash: createHash('sha256').update(shown).digest('hex'), key_last4: shown.slice(-4) })));
    assertNoKeyStored();
  },

  async rejected() {
    const owner = await signInForTest();
    const { key } = await registered(owner, 'Known');
    setPollHoldMs(5_000);
    at(T0);
    const unknown = `ezc_gsk_${'A'.repeat(43)}`;
    const refusals: PollOptions[] = [
      {}, { authorization: null }, { authorization: `Basic ${key}` }, { authorization: 'Bearer ezc_gsk_short' }, { authorization: `Bearer ${key}x` },
      { authorization: `Bearer ${key.toUpperCase()}` }, { body: 'not json' },
    ];
    for (const options of refusals) {
      const refused = await poll(unknown, report(), options);
      assert.deepEqual([refused.status, refused.body, refused.cache], [401, { answer: 'key-rejected' }, 'no-store']);
      assert(refused.ms < 1_000, 'answered at once, not held');
    }
    // The known key still works: its poll is held (here, cut short by hanging up).
    const hangUp = new AbortController();
    const held = poll(key, report(), { signal: hangUp.signal });
    await Bun.sleep(50);
    assert.equal((await viewOf(owner, (await list(owner))[0].id)).connection.state, 'connected');
    hangUp.abort();
    await held;

    // Counted, and logged once per clock hour: these 8 at the first refusal in a later hour, then that one.
    at(T0 + 59 * MINUTE);
    await poll(unknown, report());
    at(T0 + HOUR + SECOND);
    await poll(unknown, report());
    at(T0 + 3 * HOUR + 30 * MINUTE);
    await poll(unknown, report());
    assertNoKeyStored();
  },

  async hold() {
    const owner = await signInForTest();
    const { gameServer, key } = await registered(owner, 'Held');
    setPollHoldMs(150);
    at(T0);
    assert.deepEqual(Object.keys(pollRoute).filter(name => typeof (pollRoute as Record<string, unknown>)[name] === 'function'), ['POST'], 'POST only');

    // Held for the hold length, then "no change"; Connected while held.
    const pending = poll(key, report());
    await Bun.sleep(40);
    assert.deepEqual((await viewOf(owner, gameServer.id)).connection, { state: 'connected' });
    const ended = await pending;
    assert.deepEqual([ended.status, ended.body, ended.cache], [200, { answer: 'no-change' }, 'no-store']);
    assert(ended.ms >= 140, `held ${ended.ms} ms`);
    assert.deepEqual((await viewOf(owner, gameServer.id)).lastReport, { buildStamp: '20261102-153000', processed: null });

    // Recorded as reported: an id the platform never made, a result with unknown keys, extra fields ignored.
    const processed = { liveConfigurationId: '0b5e8f8e-4a4c-4c39-9a51-5c3f2b0e7d11', result: { ...SUCCESS, failure: null, futureField: 1 } };
    assert.equal((await poll(key, report({ processed, alsoFuture: true }))).body.answer, 'no-change');
    assert.deepEqual((await viewOf(owner, gameServer.id)).lastReport, { buildStamp: '20261102-153000', processed: { liveConfigurationId: processed.liveConfigurationId, result: { ...SUCCESS, failure: null } } });
    const failed = { success: false, acceptedValues: 30, changedValues: 2, unknownKeys: [], failure: { database: 'ArmingSword', category: 'Strike', error: 'x'.repeat(1500) } };
    await poll(key, report({ buildStamp: '', processed: { liveConfigurationId: 'not-a-uuid', result: failed } }));
    assert.deepEqual((await viewOf(owner, gameServer.id)).lastReport, {
      buildStamp: null,
      processed: { liveConfigurationId: 'not-a-uuid', result: { ...failed, failure: { ...failed.failure, error: 'x'.repeat(1000) } } },
    });
    await poll(key, report({ processed: null }));
    const before = (await viewOf(owner, gameServer.id)).lastReport;
    assert.deepEqual(before, { buildStamp: '20261102-153000', processed: null });

    // A body that breaks the contract: 400 at once, nothing recorded.
    const bad: [string, string][] = [
      ['not json', 'The body must be JSON'],
      ['[]', 'The body must be a JSON object'],
      [JSON.stringify({ instanceId: 'i' }), 'buildStamp must be a string'],
      [JSON.stringify(report({ buildStamp: 'x'.repeat(65) })), 'buildStamp must be at most 64 characters'],
      [JSON.stringify(report({ instanceId: '' })), 'instanceId must be 1 to 64 characters'],
      [JSON.stringify(report({ processed: [] })), 'processed must be a JSON object'],
      [JSON.stringify(report({ processed: { result: SUCCESS } })), 'processed.liveConfigurationId must be a string'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...SUCCESS, acceptedValues: -1 } } })), 'processed.result.acceptedValues must be a whole number of 0 or more'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...SUCCESS, changedValues: 1.5 } } })), 'processed.result.changedValues must be a whole number of 0 or more'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...SUCCESS, acceptedValues: '140' } } })), 'processed.result.acceptedValues must be a whole number of 0 or more'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...SUCCESS, success: 'yes' } } })), 'processed.result.success must be true or false'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...SUCCESS, unknownKeys: {} } } })), 'processed.result.unknownKeys must be an array'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...SUCCESS, unknownKeys: [{ database: 'Character', category: 'Movement' }] } } })), 'processed.result.unknownKeys[0].key must be a string'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...SUCCESS, failure: failed.failure } } })), 'processed.result.failure must be absent or null when success is true'],
      [JSON.stringify(report({ processed: { liveConfigurationId: 'id', result: { ...failed, failure: undefined } } })), 'processed.result.failure must be a JSON object'],
      [JSON.stringify(report({ padding: 'x'.repeat(128 * 1024) })), 'The body must be at most 131072 bytes'],
    ];
    for (const [body, error] of bad) {
      const refused = await poll(key, undefined, { body });
      assert.deepEqual([refused.status, refused.body], [400, { answer: 'bad-request', error }]);
      assert(refused.ms < 140, 'answered at once, not held');
    }
    assert.deepEqual((await viewOf(owner, gameServer.id)).lastReport, before);
    assertNoKeyStored();
  },

  async supersede() {
    const owner = await signInForTest();
    const [a, b] = [await registered(owner, 'Alpha'), await registered(owner, 'Bravo')];
    setPollHoldMs(400);
    at(T0);
    const first = poll(a.key, report({ instanceId: 'instance-one' }));
    const other = poll(b.key, report({ instanceId: 'instance-one' }));
    await Bun.sleep(40);
    // A newer poll from Alpha (here a second server sharing its key) supersedes the held one at once.
    const second = poll(a.key, report({ instanceId: 'instance-two' }));
    const superseded = await first;
    assert.deepEqual([superseded.status, superseded.body], [200, { answer: 'superseded' }]);
    assert(superseded.ms < 300, `answered after ${superseded.ms} ms, before its hold ended`);
    assert.deepEqual((await viewOf(owner, a.gameServer.id)).connection, { state: 'connected' });
    // So does a repeat poll from the same instance.
    await Bun.sleep(40);
    const third = poll(a.key, report({ instanceId: 'instance-two' }));
    assert.equal((await second).body.answer, 'superseded');
    const [last, bravo] = await Promise.all([third, other]);
    assert.equal(last.body.answer, 'no-change');
    assert(last.ms >= 390, 'the newest poll is held for the whole hold');
    assert.deepEqual([bravo.body.answer, bravo.ms >= 390], ['no-change', true], 'another game server\'s poll is never superseded by Alpha\'s');
    handover = { alpha: a.gameServer.id, bravo: b.gameServer.id };
    assertNoKeyStored();
  },

  async status() {
    const owner = await signInForTest();
    const { gameServer, key } = await registered(owner, 'Status');
    const connection = async () => (await viewOf(owner, gameServer.id)).connection;
    setPollHoldMs(100);
    at(T0);
    assert.deepEqual(await connection(), { state: 'never-connected' });

    // Connected while held, however long the clock says it has been held.
    const pending = poll(key, report());
    await Bun.sleep(20);
    at(T0 + 10 * MINUTE);
    assert.deepEqual(await connection(), { state: 'connected' });
    await pending;
    // Connected for 15 s after the poll ended, then Not connected with last seen.
    const ended = T0 + 10 * MINUTE;
    at(ended + 15 * SECOND);
    assert.deepEqual(await connection(), { state: 'connected' });
    at(ended + 15 * SECOND + 1);
    assert.deepEqual(await connection(), { state: 'not-connected', lastSeenAt: ended });
    at(ended + 3 * HOUR);
    assert.deepEqual(await connection(), { state: 'not-connected', lastSeenAt: ended });
    assert.deepEqual((await list(owner))[0].connection, { state: 'not-connected', lastSeenAt: ended }, 'the list shows the same');

    // A game server that hangs up mid-hold stops being held at once.
    setPollHoldMs(5_000);
    const hungUpAt = ended + 4 * HOUR;
    at(hungUpAt);
    const hangUp = new AbortController();
    const abandoned = poll(key, report(), { signal: hangUp.signal });
    await Bun.sleep(20);
    assert.deepEqual(await connection(), { state: 'connected' });
    hangUp.abort();
    assert((await abandoned).ms < 1_000, 'not held to the end');
    at(hungUpAt + 15 * SECOND);
    assert.deepEqual(await connection(), { state: 'connected' });
    at(hungUpAt + 16 * SECOND);
    assert.deepEqual(await connection(), { state: 'not-connected', lastSeenAt: hungUpAt });
    assertNoKeyStored();
  },

  async regenerate() {
    const [owner, other] = [await signInForTest('Owner A'), await signInForTest('Owner B')];
    const { gameServer, key: firstKey } = await registered(owner, 'Regenerated');
    const { id } = gameServer;
    const connection = async () => (await viewOf(owner, id)).connection;
    setPollHoldMs(5_000);
    at(T0);
    const held = poll(firstKey, report());
    await Bun.sleep(40);
    assert.deepEqual(await connection(), { state: 'connected' });

    // Only the owner, from the platform's own pages.
    assert.deepEqual(await regenerateKey(other, id), NOT_THEIRS);
    for (const notOne of [9999, 'abc', '0']) assert.deepEqual(await regenerateKey(owner, notOne), NOT_THEIRS);
    assert.equal((await regenerateKeyRoute.POST(crossSite(owner, `/api/game-servers/${id}/regenerate-key`, 'POST'), params(id))).status, 403);
    assert.deepEqual(await connection(), { state: 'connected' }, 'nothing refused touched the key');

    const regenerated = await regenerateKey(owner, id);
    assert.deepEqual([regenerated.status, regenerated.cache], [200, 'no-store']);
    const { key: secondKey } = regenerated.body.data!;
    assert.match(secondKey, KEY);
    assert.notEqual(secondKey, firstKey);
    // The old key ends at once, with no grace period: its held poll is answered "key-rejected" long before its hold ends.
    const rejected = await held;
    assert.deepEqual([rejected.status, rejected.body, rejected.cache], [401, { answer: 'key-rejected' }, 'no-store']);
    assert(rejected.ms < 1_000, `answered after ${rejected.ms} ms`);
    // Not connected at once, though a poll ended just now: shown with last seen, and the new key's last 4 characters.
    const expected: GameServerView = {
      ...gameServer, keyLast4: secondKey.slice(-4), connection: { state: 'not-connected', lastSeenAt: T0 },
      lastReport: { buildStamp: '20261102-153000', processed: null },
    };
    assert.deepEqual(regenerated.body.data!.gameServer, expected);
    assert.deepEqual(await viewOf(owner, id), expected);
    at(T0 + 5 * SECOND);
    assert.deepEqual(await connection(), { state: 'not-connected', lastSeenAt: T0 }, 'not Connected for the 15 s after its last poll either');
    const later = await poll(firstKey, report());
    assert.deepEqual([later.status, later.body], [401, { answer: 'key-rejected' }]);
    assert(later.ms < 1_000, 'the old key is rejected at once from now on');
    // The new key is shown once: no later response holds it.
    assert(!JSON.stringify([await viewOf(owner, id), await list(owner)]).includes(secondKey));

    // A poll that was looked up by its key before the key ended, and whose body was still arriving: rejected, never held.
    const late = slowPoll(secondKey);
    const third = await regenerateKey(owner, id);
    late.finish();
    const lateAnswer = await late.answered;
    assert.deepEqual([lateAnswer.status, lateAnswer.body], [401, { answer: 'key-rejected' }]);
    assert(lateAnswer.ms < 1_000, 'not held');
    assert.deepEqual(await connection(), { state: 'not-connected', lastSeenAt: T0 });
    const thirdKey = third.body.data!.key;

    // Connected again once it polls with the newest key, and as usual after that.
    setPollHoldMs(100);
    at(T0 + 10 * SECOND);
    const fresh = poll(thirdKey, report());
    await Bun.sleep(20);
    assert.deepEqual(await connection(), { state: 'connected' });
    assert.deepEqual([(await fresh).status, (await fresh).body], [200, { answer: 'no-change' }]);
    assert.deepEqual(await connection(), { state: 'connected' });
    at(T0 + 26 * SECOND);
    assert.deepEqual(await connection(), { state: 'not-connected', lastSeenAt: T0 + 10 * SECOND });

    // At rest: only the newest key's hash and last 4 characters.
    assert.deepEqual(platformStore().get('SELECT key_hash, key_last4 FROM game_servers WHERE id = ?', id), {
      key_hash: createHash('sha256').update(thirdKey).digest('hex'), key_last4: thirdKey.slice(-4),
    });
    assertNoKeyStored();
  },

  async delete() {
    const [owner, other] = [await signInForTest('Owner A'), await signInForTest('Owner B')];
    await registered(other, 'Theirs');
    const kept = await registered(owner, 'Kept');
    // Registered last, so it has the highest id: SQLite gives that id to the next game server registered.
    const doomed = await registered(owner, 'Doomed');
    const { id } = doomed.gameServer;
    setPollHoldMs(5_000);
    at(T0);
    const held = poll(doomed.key, report());
    const keptHangUp = new AbortController();
    const keptPoll = poll(kept.key, report(), { signal: keptHangUp.signal });
    await Bun.sleep(40);
    const before = everyRow();
    assert(before.drafts.some(draft => draft.game_server_id === id), 'it has a Draft to delete');

    // Only the owner, from the platform's own pages.
    assert.deepEqual(await remove(other, id), NOT_THEIRS);
    for (const notOne of [9999, 'abc', '0']) assert.deepEqual(await remove(owner, notOne), NOT_THEIRS);
    assert.equal((await gameServerRoute.DELETE(crossSite(owner, `/api/game-servers/${id}`, 'DELETE'), params(id))).status, 403);
    assert.deepEqual(everyRow(), before, 'nothing refused deleted anything');

    assert.deepEqual(await remove(owner, id), { status: 200, cache: 'no-store', body: { success: true } });
    // A poll held on its key is answered "key-rejected" at once; its key is rejected from now on.
    const rejected = await held;
    assert.deepEqual([rejected.status, rejected.body], [401, { answer: 'key-rejected' }]);
    assert(rejected.ms < 1_000, `answered after ${rejected.ms} ms`);
    const later = await poll(doomed.key, report());
    assert.deepEqual([later.status, later.body], [401, { answer: 'key-rejected' }]);
    assert.deepEqual(await read(owner, id), { status: 404, body: { success: false, error: 'No such game server' } });
    assert.deepEqual(await remove(owner, id), NOT_THEIRS, 'deleted once');
    const listed = await list(owner);
    assert.deepEqual(listed.map(server => [server.name, server.connection.state]), [['Kept', 'connected']], 'the owner\'s other game server, still held');

    // Its row goes, with every row that references it: its Draft (and its Live configuration, once they exist).
    // Every other table keeps every row: users, sessions and Invites, and the owner's Rulesets once they exist.
    const after = everyRow();
    assert.deepEqual(Object.keys(after), Object.keys(before));
    for (const [table, rows] of Object.entries(before)) {
      const columns = table === 'game_servers' ? ['id'] : gameServerColumns(table);
      assert.deepEqual(after[table], rows.filter(row => columns.every(column => row[column] !== id)), table);
    }

    // Nothing about it carries over to the next game server given its id, not even a poll that was looked up before the delete.
    const reused = await registered(owner, 'Reused');
    assert.equal(reused.gameServer.id, id, 'SQLite gives the deleted id out again');
    assert.deepEqual((await viewOf(owner, id)).connection, { state: 'never-connected' });
    const late = slowPoll(reused.key);
    assert.equal((await remove(owner, id)).status, 200);
    late.finish();
    const lateAnswer = await late.answered;
    assert.deepEqual([lateAnswer.status, lateAnswer.body], [401, { answer: 'key-rejected' }]);
    const again = await registered(owner, 'Reused again');
    assert.equal(again.gameServer.id, id);
    assert.deepEqual(await viewOf(owner, id), { ...again.gameServer, connection: { state: 'never-connected' }, sharedKey: false, lastReport: null });

    keptHangUp.abort();
    assert.equal((await keptPoll).status, 200, 'the owner\'s other game server was never touched');
    assertNoKeyStored();
  },

  async 'shared-key'() {
    const owner = await signInForTest();
    const { gameServer, key: firstKey } = await registered(owner, 'Shared');
    const sharedKey = async () => (await viewOf(owner, gameServer.id)).sharedKey;
    setPollHoldMs(5_000);
    let key = firstKey;
    const answers: Promise<Awaited<ReturnType<typeof poll>>>[] = [];
    /** A poll from `instanceId`, which supersedes the one held. */
    const from = async (instanceId: string, time: number) => {
      at(time);
      answers.push(poll(key, report({ instanceId })));
      await Bun.sleep(20);
    };

    // A restart or map change supersedes once, with a new instance id each time: never the warning, however often.
    await from('map-1', T0);
    await from('map-2', T0);
    assert.equal(await sharedKey(), false, 'a single supersede does not trip it');
    for (const instanceId of ['map-3', 'map-4', 'map-5']) await from(instanceId, T0 + SECOND);
    assert.equal(await sharedKey(), false, 'nor do restarts and map changes in a row');
    for (let repeat = 0; repeat < 3; repeat++) await from('map-5', T0 + 2 * SECOND);
    assert.equal(await sharedKey(), false, 'nor does an instance superseding its own poll');

    // Two servers on one key: each poll supersedes the other's, and each comes back about 10 s after it was superseded.
    // Each comeback counts: alpha's at 20 s and bravo's at 30 s.
    await from('alpha', T0 + 10 * SECOND);
    await from('bravo', T0 + 15 * SECOND);
    await from('alpha', T0 + 20 * SECOND);
    await from('bravo', T0 + 30 * SECOND);
    assert.equal(await sharedKey(), false, 'twice is not yet');
    await from('alpha', T0 + 5 * MINUTE + 21 * SECOND);
    assert.equal(await sharedKey(), false, 'three times, but not within 5 minutes');
    await from('bravo', T0 + 5 * MINUTE + 25 * SECOND);
    assert.equal(await sharedKey(), true, 'three times within 5 minutes: 30 s, 5:21 and 5:25');
    await from('alpha', T0 + 5 * MINUTE + 29 * SECOND);
    assert.equal(await sharedKey(), true, 'and while they keep at it (logged once)');

    // Time moved forward: it clears once fewer than 3 are within the last 5 minutes (5:25 and 5:29, from 10:21).
    at(T0 + 10 * MINUTE + 21 * SECOND - 1);
    assert.equal(await sharedKey(), true);
    at(T0 + 10 * MINUTE + 21 * SECOND);
    assert.equal(await sharedKey(), false);
    assert.equal((await list(owner))[0].sharedKey, false, 'the list shows the same');

    // Starting again trips it again, and is logged again.
    await from('bravo', T0 + 11 * MINUTE);
    await from('alpha', T0 + 11 * MINUTE + 10 * SECOND);
    await from('bravo', T0 + 11 * MINUTE + 20 * SECOND);
    assert.equal(await sharedKey(), false);
    await from('alpha', T0 + 11 * MINUTE + 30 * SECOND);
    assert.equal(await sharedKey(), true);

    // Regenerate key clears it and starts the count again: alpha's held poll is rejected, as is bravo's next on the old key.
    at(T0 + 11 * MINUTE + 35 * SECOND);
    const regenerated = await regenerateKey(owner, gameServer.id);
    assert.equal(regenerated.body.data!.gameServer.sharedKey, false);
    assert.equal(await sharedKey(), false);
    assert.deepEqual((await answers.at(-1)!).status, 401);
    await from('bravo', T0 + 11 * MINUTE + 40 * SECOND);
    assert.equal((await answers.at(-1)!).status, 401, 'the old key');
    key = regenerated.body.data!.key;
    await from('alpha', T0 + 11 * MINUTE + 45 * SECOND);
    setPollHoldMs(50);
    await from('bravo', T0 + 11 * MINUTE + 50 * SECOND);
    assert.equal(await sharedKey(), false, 'bravo was superseded before the key ended, which no longer counts');

    const all = await Promise.all(answers);
    assert.deepEqual(all.map(answer => [answer.status, answer.body.answer]), [
      ...Array.from({ length: 18 }, () => [200, 'superseded']),
      [401, 'key-rejected'], [401, 'key-rejected'], [200, 'superseded'], [200, 'no-change'],
    ]);
    assertNoKeyStored();
  },

  /** First half of a restart: polls, two of them unchanged, whose times are kept in memory. */
  async 'before-restart'() {
    const owner = await signInForTest();
    const { gameServer, key } = await registered(owner, 'Restarted');
    setPollHoldMs(20);
    at(T0);
    await poll(key, report());
    at(T0 + 2 * MINUTE);
    await poll(key, report());
    at(T0 + 3 * MINUTE);
    await poll(key, report({ buildStamp: '20261103-090000' }));
    at(T0 + 4 * MINUTE);
    await poll(key, report({ buildStamp: '20261103-090000' }));
    at(T0 + 10 * MINUTE);
    assert.deepEqual((await viewOf(owner, gameServer.id)).connection, { state: 'not-connected', lastSeenAt: T0 + 4 * MINUTE }, 'last seen is exact while the process runs');
    handover = { cookie: owner.cookie, id: gameServer.id, t0: T0 };
  },

  /** Second half, in a new process on the same database: nothing is held, and last seen comes from the last poll written. */
  async 'after-restart'() {
    const { cookie, id } = handedOver!;
    const owner = { request: (url: string) => new Request(new URL(url, env.publicUrl), { headers: { Cookie: cookie } }) } as TestSession;
    at(T0 + 3 * MINUTE + 15 * SECOND);
    assert.deepEqual((await viewOf(owner, id)).connection, { state: 'connected' }, 'a poll ended at most about 15 s ago');
    at(T0 + 20 * MINUTE);
    const view = await viewOf(owner, id);
    // The changed build stamp was written at once; the unchanged poll a minute later waits for the 5-minute write.
    assert.deepEqual(view.connection, { state: 'not-connected', lastSeenAt: T0 + 3 * MINUTE });
    assert.deepEqual(view.lastReport, { buildStamp: '20261103-090000', processed: null });
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, secrets: [...keys], handover } }));
