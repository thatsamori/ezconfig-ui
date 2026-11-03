/**
 * Apply and delivery through the route handlers: the review, why Apply is
 * disabled, stale reviews, validation, the held poll woken by Apply, polls
 * answered at once, no wipe before the first Apply, and Discard changes. One
 * scenario per run (argv[2]), each in its own process with the env set by
 * tests/platform-apply.test.ts, on the Supported build set below. Polls are
 * held for a short real time (setPollHoldMs); the clock that connection status
 * reads is moved with setSystemTime.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with the Live
 * configuration ids Apply made, in order, for the test to check the log.
 */
import { setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { FieldError } from '../../src/lib/config/valuesDocument';
import type { GameServerView } from '../../src/lib/platform/game-servers';
import type { ApplyReview } from '../../src/lib/platform/live-configurations';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const { pollActivity, setPollHoldMs } = await import('../../src/lib/platform/polls');
const { lookupDefault } = await import('../../src/lib/config/defaults');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const gameServerRoute = await import('../../src/app/api/game-servers/[id]/route');
const draftRoute = await import('../../src/app/api/game-servers/[id]/draft/route');
const discardRoute = await import('../../src/app/api/game-servers/[id]/draft/discard/route');
const applyRoute = await import('../../src/app/api/game-servers/[id]/apply/route');
const pollRoute = await import('../../src/app/game-server/poll/route');

const scenario = process.argv[2];
const SUPPORTED = '20261102-153000', OTHER_BUILD = '20261101-090000';
const SECOND = 1000, HOUR = 3_600_000;
/** The next whole hour: the clock connection status reads, ahead of the session the fixture signs in with. */
const T0 = Math.ceil(Date.now() / HOUR) * HOUR;
const at = (time: number) => setSystemTime(new Date(time));
platformStore().run('INSERT INTO supported_build (id, stamp, set_at) VALUES (1, ?, 0)', SUPPORTED);
/** The Live configuration ids Apply answered with, in order. */
const applied: string[] = [];

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const answer = async <Body>(response: Response) => ({ status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Body });

async function registered(session: TestSession, name: string): Promise<{ id: number; key: string }> {
  const response = await gameServersRoute.POST(session.request('/api/game-servers', json('POST', { name })));
  assert.equal(response.status, 201);
  const { gameServer, key } = (await response.json()).data;
  return { id: gameServer.id, key };
}
async function viewOf(session: TestSession, id: number): Promise<GameServerView> {
  const response = await gameServerRoute.GET(session.request(`/api/game-servers/${id}`), params(id));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
/** Auto-save: the whole document over the Draft's current revision. Resolves to the new revision. */
async function save(session: TestSession, id: number, document: unknown): Promise<number> {
  const { revision } = (await (await draftRoute.GET(session.request(`/api/game-servers/${id}/draft`), params(id))).json()).data;
  const response = await draftRoute.PUT(session.request(`/api/game-servers/${id}/draft`, json('PUT', { revision, document })), params(id));
  assert.equal(response.status, 200, 'the Draft saves');
  return (await response.json()).data.revision;
}
/** Stores a document without validation, as an older schema could have saved it; the revision rises. */
const storeUnvalidated = (id: number, document: unknown) => platformStore().run('UPDATE drafts SET overrides = ?, revision = revision + 1 WHERE game_server_id = ?', JSON.stringify(document), id);
const draftRow = (id: number) => platformStore().get<{ overrides: string; revision: number }>('SELECT overrides, revision FROM drafts WHERE game_server_id = ?', id)!;
const liveRows = (id: number) => platformStore().all<{ id: string; overrides: string; applied_at: number }>('SELECT id, overrides, applied_at FROM live_configurations WHERE game_server_id = ?', id);

type ApplyBody = { success: boolean; error?: string; reason?: string; data?: ApplyReview & { liveConfigurationId: string; appliedAt: number }; details?: FieldError[] };
async function reviewOf(session: TestSession, id: number | string) {
  return answer<{ success: boolean; error?: string; data?: ApplyReview }>(await applyRoute.GET(session.request(`/api/game-servers/${id}/apply`), params(id)));
}
async function review(session: TestSession, id: number): Promise<ApplyReview> {
  const { status, cache, body } = await reviewOf(session, id);
  assert.deepEqual([status, cache], [200, 'no-store']);
  return body.data!;
}
/** Apply with the revision and Live configuration id of a review: by default, one built just now. */
async function apply(session: TestSession, id: number | string, base?: unknown) {
  const sent = base ?? await review(session, Number(id)).then(({ revision, liveConfigurationId }) => ({ revision, liveConfigurationId }));
  const result = await answer<ApplyBody>(await applyRoute.POST(session.request(`/api/game-servers/${id}/apply`, json('POST', sent)), params(id)));
  if (result.status === 200) applied.push(result.body.data!.liveConfigurationId);
  return result;
}
async function discard(session: TestSession, id: number | string, body: unknown) {
  return answer<{ success: boolean; error?: string; data?: { values: unknown; dropped: number; revision: number; savedAt: number | null } }>(
    await discardRoute.POST(session.request(`/api/game-servers/${id}/draft/discard`, json('POST', body)), params(id)),
  );
}

type Delivery = { answer: string; liveConfigurationId?: string; commands?: { database: string; category: string; values: string }[] };
type Polled = { status: number; cache: string | null; body: Delivery; ms: number };
const report = (fields: Record<string, unknown> = {}) => ({ buildStamp: SUPPORTED, instanceId: 'instance-a', processed: null, ...fields });
const processed = (liveConfigurationId: string) => ({ liveConfigurationId, result: { success: true, acceptedValues: 2, changedValues: 2, unknownKeys: [], failure: null } });
/** A game server polling, as the mod sends it. */
async function poll(key: string, body: unknown, signal?: AbortSignal): Promise<Polled> {
  const started = performance.now();
  const response = await pollRoute.POST(new Request(new URL('/game-server/poll', env.publicUrl), {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
  }));
  return { status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Delivery, ms: performance.now() - started };
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

const MOVEMENT = { database: 'Character', category: 'Movement' };
const DOCUMENT = { Character: { MaxWalkSpeed: 450, CanDodge: false, ForwardParryLength: 50 }, Weapon: { ArmingSword: { ParryTurnCap: { x: 375, y: 262.5 }, Strike: { Windup: 0.5 } } } };
const COMMANDS = [
  { ...MOVEMENT, values: '{"MaxWalkSpeed":"450.00","CanDodge":"False"}' },
  { database: 'Character', category: 'Parry', values: '{"ForwardParryLength":"50"}' },
  { database: 'ArmingSword', category: 'General', values: '{"ParryTurnCap":"X=375.00,Y=262.50,Z=0.00"}' },
  { database: 'ArmingSword', category: 'Strike', values: '{"Windup":"0.50"}' },
];
const BLOCKED = {
  'never-connected': 'Never connected: Apply needs the game server Connected',
  'not-connected': 'Not connected: Apply needs the game server Connected',
  'needs-updating': 'EZConfig needs updating: the platform sends configuration only to the Supported build',
};
const STALE = 'The Draft or the Live configuration changed since this review was built';

const scenarios: Record<string, () => Promise<void>> = {
  async review() {
    const owner = await signInForTest();
    const { id, key } = await registered(owner, 'Duel EU');
    // Before the first Apply, with an empty Draft: nothing to list, and nothing unapplied.
    assert.deepEqual(await review(owner, id), { revision: 0, liveConfigurationId: null, added: [], changed: [], reset: [], errors: [] });
    assert.deepEqual(await viewOf(owner, id).then(({ liveConfiguration, unappliedChanges }) => ({ liveConfiguration, unappliedChanges })), { liveConfiguration: null, unappliedChanges: false });

    // The first Apply lists every value the Draft sets: Character first, then by weapon, category and key. A value the schema has no place for is not one.
    await save(owner, id, DOCUMENT);
    storeUnvalidated(id, { ...DOCUMENT, Character: { ...DOCUMENT.Character, RetiredKey: 1 } });
    const first = await review(owner, id);
    assert.deepEqual(first, {
      revision: 2, liveConfigurationId: null,
      added: [
        { ...MOVEMENT, key: 'CanDodge', draft: false },
        { ...MOVEMENT, key: 'MaxWalkSpeed', draft: 450 },
        { database: 'Character', category: 'Parry', key: 'ForwardParryLength', draft: 50 },
        { database: 'ArmingSword', category: 'General', key: 'ParryTurnCap', draft: { x: 375, y: 262.5 } },
        { database: 'ArmingSword', category: 'Strike', key: 'Windup', draft: 0.5 },
      ],
      changed: [], reset: [], errors: [],
    });
    assert.equal((await viewOf(owner, id)).unappliedChanges, true, 'a Draft that sets values has Unapplied changes before the first Apply');

    const game = await held(key, id, report());
    assert.equal((await apply(owner, id, { revision: first.revision, liveConfigurationId: null })).status, 200);
    await game.answered;
    const liveConfigurationId = applied[0];
    // No changes: nothing listed, and the review is of the new Live configuration.
    assert.deepEqual(await review(owner, id), { revision: 2, liveConfigurationId, added: [], changed: [], reset: [], errors: [] });
    const view = await viewOf(owner, id);
    assert.deepEqual([view.liveConfiguration, view.unappliedChanges], [{ id: liveConfigurationId, appliedAt: liveRows(id)[0].applied_at, state: 'pending' }, false]);

    // Added, changed and reset to game default, against the Live configuration. A pin, set equal to its game default, is still a change.
    const walkDefault = lookupDefault('Character', 'Movement', 'MaxWalkSpeed').defaultValue as number;
    assert.notEqual(walkDefault, 450);
    await save(owner, id, {
      Character: { MaxWalkSpeed: walkDefault, ForwardParryLength: 50, TimeToMaxSprint: 0.96 },
      Weapon: { ArmingSword: { ParryTurnCap: { x: 375, y: 270 }, Strike: { Windup: 0.5 } } },
    });
    const changes = await review(owner, id);
    assert.deepEqual(changes, {
      revision: 3, liveConfigurationId,
      added: [{ ...MOVEMENT, key: 'TimeToMaxSprint', draft: 0.96 }],
      changed: [
        { ...MOVEMENT, key: 'MaxWalkSpeed', live: 450, draft: walkDefault },
        { database: 'ArmingSword', category: 'General', key: 'ParryTurnCap', live: { x: 375, y: 262.5 }, draft: { x: 375, y: 270 } },
      ],
      reset: [{ ...MOVEMENT, key: 'CanDodge', live: false }],
      errors: [],
    });
    assert.equal((await viewOf(owner, id)).unappliedChanges, true);

    // Values the current schema refuses are listed to fix.
    storeUnvalidated(id, { Character: { CustomFOV: true, CustomFOVMax: 120.5 } });
    assert.deepEqual((await review(owner, id)).errors, [{ database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: 'Use a whole number.' }]);
  },

  async blocked() {
    const owner = await signInForTest();
    const { id, key } = await registered(owner, 'Duel EU');
    await save(owner, id, DOCUMENT);
    setPollHoldMs(60_000);
    at(T0);
    /** Apply is refused with its reason, both in the view and when the request arrives, and nothing is applied. */
    const refused = async (reason: keyof typeof BLOCKED) => {
      assert.equal((await viewOf(owner, id)).applyBlocked, reason);
      const result = await apply(owner, id);
      assert.deepEqual([result.status, result.cache, result.body], [409, 'no-store', { success: false, error: BLOCKED[reason], reason }], reason);
      assert.deepEqual(liveRows(id), []);
    };
    await refused('never-connected');

    // Connected, but on another build: EZConfig needs updating.
    let game = await held(key, id, report({ buildStamp: OTHER_BUILD }));
    assert.equal((await viewOf(owner, id)).connection.state, 'connected');
    await refused('needs-updating');
    await game.hangUp();
    // Or no Supported build is set at all.
    platformStore().run('DELETE FROM supported_build');
    game = await held(key, id, report());
    await refused('needs-updating');
    await game.hangUp();
    platformStore().run('INSERT INTO supported_build (id, stamp, set_at) VALUES (1, ?, 0)', SUPPORTED);

    // On the Supported build and Connected: Apply is enabled. A review built now, Applied after the game server dropped, is refused.
    game = await held(key, id, report());
    assert.equal((await viewOf(owner, id)).applyBlocked, null);
    const { revision, liveConfigurationId } = await review(owner, id);
    await game.hangUp();
    at(T0 + 14 * SECOND);
    assert.equal((await viewOf(owner, id)).applyBlocked, null, 'Connected for about 15 s after its last poll');
    at(T0 + 16 * SECOND);
    assert.equal((await apply(owner, id, { revision, liveConfigurationId })).body.reason, 'not-connected');
    await refused('not-connected');

    // Back: Apply goes through.
    game = await held(key, id, report());
    assert.equal((await apply(owner, id, { revision, liveConfigurationId })).status, 200);
    assert.equal((await game.answered).body.answer, 'live-configuration');
  },

  async stale() {
    const owner = await signInForTest();
    const { id, key } = await registered(owner, 'Duel EU');
    setPollHoldMs(60_000);
    let game = await held(key, id, report());
    await save(owner, id, { Character: { MaxWalkSpeed: 450 } });
    const built = await review(owner, id);
    // The Draft saved again after the review: refused with the review as it is now, which reopens.
    await save(owner, id, { Character: { MaxWalkSpeed: 460 } });
    const now = await review(owner, id);
    assert.deepEqual(now.added, [{ ...MOVEMENT, key: 'MaxWalkSpeed', draft: 460 }]);
    const stale = await apply(owner, id, { revision: built.revision, liveConfigurationId: null });
    assert.deepEqual([stale.status, stale.cache, stale.body], [409, 'no-store', { success: false, error: STALE, reason: 'stale', data: now }]);
    assert.deepEqual(liveRows(id), [], 'nothing is applied');
    assert(pollActivity(id).held, 'and nothing is delivered');

    // The Live configuration changed after the review: refused too.
    assert.equal((await apply(owner, id, { revision: now.revision, liveConfigurationId: null })).status, 200);
    assert.equal((await game.answered).body.liveConfigurationId, applied[0]);
    game = await held(key, id, report({ processed: processed(applied[0]) }));
    const afterFirst = await review(owner, id);
    for (const liveConfigurationId of [null, 'f3c1a6d0-0000-4000-8000-000000000000']) {
      const refused = await apply(owner, id, { revision: now.revision, liveConfigurationId });
      assert.deepEqual([refused.status, refused.body], [409, { success: false, error: STALE, reason: 'stale', data: afterFirst }], String(liveConfigurationId));
    }
    assert.deepEqual(liveRows(id).map(row => row.id), [applied[0]]);
    assert(pollActivity(id).held);

    // A body without both is refused before anything is read.
    for (const body of [{}, { revision: now.revision }, { liveConfigurationId: null }, { revision: -1, liveConfigurationId: null }, { revision: now.revision, liveConfigurationId: 5 }, { revision: now.revision, liveConfigurationId: '' }]) {
      const refused = await apply(owner, id, body);
      assert.deepEqual([refused.status, refused.body], [400, { success: false, error: 'Send the Draft revision and the Live configuration id the review was built from' }], JSON.stringify(body));
    }
    await game.hangUp();
  },

  async validation() {
    const owner = await signInForTest();
    const { id, key } = await registered(owner, 'Duel EU');
    setPollHoldMs(60_000);
    const game = await held(key, id, report());
    // A tightened key, saved under an older schema: Apply is blocked with the values to fix. A value the schema has no place for never blocks.
    storeUnvalidated(id, { Character: { CustomFOV: true, CustomFOVMax: 120.5, OutOfStaminaStunDuration: -1, RetiredKey: 1 }, Weapon: { Claymore: { Windup: 0.5 } } });
    const details = [
      { database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: 'Use a whole number.' },
      { database: 'Character', category: 'Stun', key: 'OutOfStaminaStunDuration', error: 'Use a finite value of 0 or more.' },
    ];
    assert.deepEqual((await review(owner, id)).errors, details);
    const refused = await apply(owner, id);
    assert.deepEqual([refused.status, refused.cache, refused.body], [400, 'no-store', { success: false, error: 'Validation failed', details }]);
    assert.deepEqual(liveRows(id), [], 'nothing is applied');
    assert(pollActivity(id).held, 'and nothing is delivered');

    // Fixed: Applied with the value the schema has no place for kept as stored, and not sent.
    const fixed = { Character: { CustomFOV: true, CustomFOVMax: 120, RetiredKey: 1 }, Weapon: { Claymore: { Windup: 0.5 } } };
    storeUnvalidated(id, fixed);
    assert.equal((await apply(owner, id)).status, 200);
    assert.deepEqual(liveRows(id).map(row => JSON.parse(row.overrides)), [fixed]);
    assert.deepEqual((await game.answered).body.commands, [{ database: 'Character', category: 'Camera', values: '{"CustomFOV":"True","CustomFOVMax":"120"}' }]);
  },

  async delivery() {
    const owner = await signInForTest();
    const { id, key } = await registered(owner, 'Duel EU');
    await save(owner, id, DOCUMENT);
    setPollHoldMs(60_000);
    const first = await held(key, id, report());
    const started = performance.now();
    const response = await apply(owner, id);
    assert.equal(response.status, 200);
    const { liveConfigurationId, appliedAt } = response.body.data!;
    assert.match(liveConfigurationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'a random UUID');
    assert.deepEqual(response.body, { success: true, data: { liveConfigurationId, appliedAt } });
    // The held poll is answered at once with the whole Live configuration, grouped by category.
    const woken = await first.answered;
    assert(performance.now() - started < 1_000, 'answered promptly');
    assert.deepEqual([woken.status, woken.cache, woken.body], [200, 'no-store', { answer: 'live-configuration', liveConfigurationId, commands: COMMANDS }]);
    assert.deepEqual(liveRows(id), [{ id: liveConfigurationId, overrides: JSON.stringify(DOCUMENT), applied_at: appliedAt }]);
    assert.equal(draftRow(id).revision, 1, 'Apply leaves the Draft as it was');

    // The game server reports processing it: held, nothing to send.
    const settled = await held(key, id, report({ processed: processed(liveConfigurationId) }));
    // An Apply with no changes still makes a new id, replacing the previous, and the configuration is sent again.
    assert.deepEqual(await review(owner, id).then(({ added, changed, reset }) => [added, changed, reset]), [[], [], []]);
    const again = await apply(owner, id);
    const secondId = again.body.data!.liveConfigurationId;
    assert.notEqual(secondId, liveConfigurationId);
    assert.deepEqual((await settled.answered).body, { answer: 'live-configuration', liveConfigurationId: secondId, commands: COMMANDS });
    assert.deepEqual(liveRows(id).map(row => row.id), [secondId], 'the previous Live configuration is deleted');

    // A poll reporting another id, one the platform does not know, or none (a crash, a new build) gets it at once, never held.
    for (const reported of [processed(liveConfigurationId), processed('not-a-real-id'), null]) {
      const polled = await poll(key, report({ processed: reported }));
      assert.deepEqual([polled.status, polled.body], [200, { answer: 'live-configuration', liveConfigurationId: secondId, commands: COMMANDS }], JSON.stringify(reported));
      assert(polled.ms < 1_000, 'answered at once');
    }
    // Answered at once, it still supersedes the poll held for the game server.
    const waiting = await held(key, id, report({ processed: processed(secondId) }));
    assert.deepEqual((await poll(key, report({ instanceId: 'instance-b' }))).body.liveConfigurationId, secondId);
    assert.deepEqual((await waiting.answered).body, { answer: 'superseded' });
    assert.equal((await viewOf(owner, id)).connection.state, 'connected');

    // Another build gets nothing, whatever it reports: "not-supported-build" when its hold ends.
    setPollHoldMs(100);
    for (const reported of [null, processed(secondId)]) assert.deepEqual((await poll(key, report({ buildStamp: OTHER_BUILD, processed: reported }))).body, { answer: 'not-supported-build' });
    // The one reporting it has nothing more to get.
    assert.deepEqual((await poll(key, report({ processed: processed(secondId) }))).body, { answer: 'no-change' });

    // Deleting the game server deletes its Live configuration.
    assert.equal((await gameServerRoute.DELETE(owner.request(`/api/game-servers/${id}`, { method: 'DELETE' }), params(id))).status, 200);
    assert.deepEqual(liveRows(id), []);
  },

  async 'no-wipe'() {
    const owner = await signInForTest();
    const { id, key } = await registered(owner, 'Duel EU');
    await save(owner, id, DOCUMENT);
    setPollHoldMs(100);
    // Never Applied: whatever the game server reports, it is held and gets "no change", never a wipe.
    for (const reported of [null, processed('0b5e8f8e-4a4c-4c39-9a51-5c3f2b0e7d11'), processed('not-a-real-id')]) {
      const polled = await poll(key, report({ processed: reported }));
      assert.deepEqual([polled.status, polled.body], [200, { answer: 'no-change' }], JSON.stringify(reported));
      assert(polled.ms >= 90, 'held');
    }
    assert.deepEqual(liveRows(id), []);
    assert.equal((await viewOf(owner, id)).liveConfiguration, null);
  },

  async discard() {
    const owner = await signInForTest();
    const { id, key } = await registered(owner, 'Duel EU');
    await save(owner, id, DOCUMENT);
    // Nothing applied yet: nothing to discard to, and the Draft stays.
    assert.deepEqual(await discard(owner, id, { revision: 1 }), { status: 409, cache: 'no-store', body: { success: false, error: 'There is no Live configuration yet: nothing has been applied' } });
    assert.equal(draftRow(id).overrides, JSON.stringify(DOCUMENT));

    setPollHoldMs(60_000);
    const game = await held(key, id, report());
    assert.equal((await apply(owner, id)).status, 200);
    await game.answered;
    const edited = await save(owner, id, { Character: { MaxWalkSpeed: 460 } });
    assert.equal((await viewOf(owner, id)).unappliedChanges, true);

    // A stale revision is refused with the current Draft, and nothing is discarded.
    const current = (await (await draftRoute.GET(owner.request(`/api/game-servers/${id}/draft`), params(id))).json()).data;
    assert.deepEqual(await discard(owner, id, { revision: edited - 1 }), { status: 409, cache: 'no-store', body: { success: false, error: 'The Draft changed since this page loaded it', data: current } });
    assert.deepEqual(await discard(owner, id, {}), { status: 400, cache: 'no-store', body: { success: false, error: 'Send the revision the discard is based on' } });
    assert.equal(draftRow(id).overrides, JSON.stringify({ Character: { MaxWalkSpeed: 460 } }));

    // Discard changes: the Draft is the Live configuration's values again, at a raised revision; the Live configuration is as it was.
    const discarded = await discard(owner, id, { revision: edited });
    assert.deepEqual([discarded.status, discarded.cache], [200, 'no-store']);
    assert.deepEqual(discarded.body.data!.values, {
      character: { Movement: { MaxWalkSpeed: 450, CanDodge: false }, Parry: { ForwardParryLength: 50 } },
      weapons: { ArmingSword: { General: { ParryTurnCap: { x: 375, y: 262.5 } }, Strike: { Windup: 0.5 } } },
    });
    assert.equal(discarded.body.data!.revision, edited + 1);
    assert.deepEqual(draftRow(id), { overrides: JSON.stringify(DOCUMENT), revision: edited + 1 });
    assert.deepEqual(liveRows(id).map(row => row.id), applied);
    assert.equal((await viewOf(owner, id)).unappliedChanges, false);
  },

  async ownership() {
    const owner = await signInForTest('Owner');
    const other = await signInForTest('Other owner');
    const { id, key } = await registered(owner, 'Duel EU');
    await save(owner, id, DOCUMENT);
    setPollHoldMs(60_000);
    const game = await held(key, id, report());
    // Another owner's game server reads as missing, as does an id that is not one.
    const missing = { status: 404, cache: 'no-store', body: { success: false, error: 'No such game server' } };
    for (const target of [id, 999, '0', 'abc']) {
      assert.deepEqual(await reviewOf(other, target), missing, `review ${target}`);
      assert.deepEqual(await apply(other, target, { revision: 1, liveConfigurationId: null }), missing, `apply ${target}`);
      assert.deepEqual(await discard(other, target, { revision: 1 }), missing, `discard ${target}`);
    }
    // Signed out, or a change from another origin.
    assert.equal((await applyRoute.GET(new Request(new URL(`/api/game-servers/${id}/apply`, env.publicUrl)), params(id))).status, 401);
    const foreign = (path: string) => new Request(new URL(`/api/game-servers/${id}/${path}`, env.publicUrl), {
      ...json('POST', { revision: 1, liveConfigurationId: null }), headers: { 'Content-Type': 'application/json', Cookie: owner.cookie, Origin: 'https://elsewhere.test' },
    });
    assert.equal((await applyRoute.POST(foreign('apply'), params(id))).status, 403);
    assert.equal((await discardRoute.POST(foreign('draft/discard'), params(id))).status, 403);
    assert.deepEqual(liveRows(id), []);
    assert(pollActivity(id).held);
    await game.hangUp();
  },
};

const run = scenarios[scenario];
assert(run, `unknown scenario ${scenario}`);
await run();
console.log(JSON.stringify({ fixture: { scenario, applied } }));
