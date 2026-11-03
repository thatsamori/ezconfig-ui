/**
 * Rulesets through the route handlers: Save as Ruleset version (a new Ruleset
 * or the next version), loading a version (dropped values, current
 * categories), modified, rename with unique names, delete clearing origins,
 * privacy between owners, and stale revisions on save and load. One scenario
 * per run (argv[2]), each in its own process with the env set by
 * tests/platform-rulesets.test.ts. Asserts as it goes. A Live configuration is
 * made with applyDraft itself: the Apply route's Connected check is
 * platform-apply's.
 */
import assert from 'node:assert/strict';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { DraftView } from '../../src/lib/platform/drafts';
import type { GameServerView } from '../../src/lib/platform/game-servers';
import type { Origin } from '../../src/lib/platform/origins';
import type { RulesetSummary, RulesetVersionSummary } from '../../src/lib/platform/rulesets';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const { applyDraft } = await import('../../src/lib/platform/live-configurations');
const { lookupDefault } = await import('../../src/lib/config/defaults');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const gameServerRoute = await import('../../src/app/api/game-servers/[id]/route');
const draftRoute = await import('../../src/app/api/game-servers/[id]/draft/route');
const resetRoute = await import('../../src/app/api/game-servers/[id]/draft/reset/route');
const discardRoute = await import('../../src/app/api/game-servers/[id]/draft/discard/route');
const saveVersionRoute = await import('../../src/app/api/game-servers/[id]/draft/save-version/route');
const loadRoute = await import('../../src/app/api/game-servers/[id]/draft/load/route');
const rulesetsRoute = await import('../../src/app/api/rulesets/route');
const rulesetRoute = await import('../../src/app/api/rulesets/[id]/route');

type Saved = { ruleset: { id: number; name: string }; version: RulesetVersionSummary; draft: DraftView };
type Loaded = { draft: DraftView; dropped: number; errors: { database: string; category?: string; key: string; error: string }[] };
type Body<Data> = { success: boolean; error?: string; data?: Data };

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const at = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const draftUrl = (id: number | string) => `/api/game-servers/${id}/draft`;
const answer = async <Data>(response: Response) => ({ status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Body<Data> });
const STALE = 'The Draft changed since this page loaded it';

async function register(session: TestSession, name: string): Promise<number> {
  const response = await gameServersRoute.POST(session.request('/api/game-servers', json('POST', { name })));
  assert.equal(response.status, 201);
  return (await response.json()).data.gameServer.id;
}
const draft = async (session: TestSession, id: number | string) => answer<DraftView>(await draftRoute.GET(session.request(draftUrl(id)), at(id)));
async function view(session: TestSession, id: number): Promise<DraftView> {
  const { status, body } = await draft(session, id);
  assert.equal(status, 200);
  return body.data!;
}
async function server(session: TestSession, id: number): Promise<GameServerView> {
  const response = await gameServerRoute.GET(session.request(`/api/game-servers/${id}`), at(id));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
/** Auto-save over the Draft's current revision; resolves to the answer's data. */
async function save(session: TestSession, id: number, document: unknown): Promise<{ revision: number; savedAt: number; origin: Origin | null }> {
  const { revision } = await view(session, id);
  const { status, body } = await answer<{ revision: number; savedAt: number; origin: Origin | null }>(await draftRoute.PUT(session.request(draftUrl(id), json('PUT', { revision, document })), at(id)));
  assert.equal(status, 200, 'the Draft saves');
  return body.data!;
}
const saveVersion = async (session: TestSession, id: number | string, body: Record<string, unknown>) =>
  answer<Saved | DraftView>(await saveVersionRoute.POST(session.request(`${draftUrl(id)}/save-version`, json('POST', body)), at(id)));
const loadVersion = async (session: TestSession, id: number | string, body: Record<string, unknown>) =>
  answer<Loaded | DraftView>(await loadRoute.POST(session.request(`${draftUrl(id)}/load`, json('POST', body)), at(id)));
/** Save as Ruleset version over the Draft's current revision, which must succeed. */
async function saved(session: TestSession, id: number, target: { rulesetId: number } | { name: string }, description?: string): Promise<Saved> {
  const { revision } = await view(session, id);
  const { status, cache, body } = await saveVersion(session, id, { revision, ...target, description });
  assert.deepEqual([status, cache], [201, 'no-store'], JSON.stringify(body));
  return body.data as Saved;
}
/** Loads a version over the Draft's current revision, which must succeed. */
async function loaded(session: TestSession, id: number, versionId: number): Promise<Loaded> {
  const { revision } = await view(session, id);
  const { status, cache, body } = await loadVersion(session, id, { revision, versionId });
  assert.deepEqual([status, cache], [200, 'no-store'], JSON.stringify(body));
  return body.data as Loaded;
}
async function list(session: TestSession): Promise<RulesetSummary[]> {
  const { status, cache, body } = await answer<RulesetSummary[]>(await rulesetsRoute.GET(session.request('/api/rulesets')));
  assert.deepEqual([status, cache], [200, 'no-store']);
  return body.data!;
}
const rename = async (session: TestSession, id: number | string, name: unknown) => answer<{ id: number; name: string }>(await rulesetRoute.PATCH(session.request(`/api/rulesets/${id}`, json('PATCH', { name })), at(id)));
const remove = async (session: TestSession, id: number | string) => answer<undefined>(await rulesetRoute.DELETE(session.request(`/api/rulesets/${id}`, { method: 'DELETE' }), at(id)));
/** Applies the Draft as it is now, as the Apply route would once the game server is Connected. */
function apply(id: number): string {
  const live = platformStore().get<{ id: string }>('SELECT id FROM live_configurations WHERE game_server_id = ?', id);
  const { revision } = platformStore().get<{ revision: number }>('SELECT revision FROM drafts WHERE game_server_id = ?', id)!;
  const result = applyDraft(id, { revision, liveConfigurationId: live?.id ?? null });
  assert(result?.ok, 'applied');
  return result.liveConfiguration.id;
}
const storedDraft = (id: number) => platformStore().get<{ overrides: string; revision: number; origin_id: number | null }>('SELECT overrides, revision, origin_id FROM drafts WHERE game_server_id = ?', id)!;
const storedLive = (id: number) => platformStore().get<{ id: string; overrides: string; origin_id: number | null }>('SELECT id, overrides, origin_id FROM live_configurations WHERE game_server_id = ?', id);
const versionRows = () => platformStore().all<{ id: number; ruleset_id: number; number: number; description: string | null; overrides: string }>('SELECT id, ruleset_id, number, description, overrides FROM ruleset_versions ORDER BY id');
const rulesetRows = () => platformStore().all<{ id: number; owner_id: number; name: string; name_key: string }>('SELECT id, owner_id, name, name_key FROM rulesets ORDER BY id');
/** A version as an older schema's save would have left it: stored as given, no check. */
const storeVersion = (rulesetId: number, overrides: unknown) => platformStore().get<{ id: number }>(
  'INSERT INTO ruleset_versions (ruleset_id, number, description, overrides, saved_at) VALUES (?, (SELECT MAX(number) + 1 FROM ruleset_versions WHERE ruleset_id = ?), NULL, ?, 0) RETURNING id',
  rulesetId, rulesetId, JSON.stringify(overrides),
)!.id;
const origin = (ruleset: { id: number; name: string }, version: { id: number; number: number }, modified: boolean): Origin =>
  ({ rulesetId: ruleset.id, rulesetName: ruleset.name, versionId: version.id, number: version.number, modified });

const session = await signInForTest();
const id = await register(session, 'Duel EU');
const DOCUMENT = { Character: { MaxWalkSpeed: 450, ForwardParryLength: 50 }, Weapon: { ArmingSword: { Strike: { Windup: 0.5 } } } };

switch (process.argv[2]) {
  case 'save-new-and-next': {
    await save(session, id, DOCUMENT);
    const before = storedDraft(id);
    const first = await saved(session, id, { name: '  Competitive ' }, ' First cut \r\n with notes ');
    assert.deepEqual(first.ruleset, { id: first.ruleset.id, name: 'Competitive' }, 'the name is trimmed');
    assert.deepEqual({ ...first.version, savedAt: 0 }, { id: first.version.id, number: 1, description: 'First cut \n with notes', savedAt: 0 }, 'version 1 of a new Ruleset');
    assert.deepEqual(versionRows(), [{ id: first.version.id, ruleset_id: first.ruleset.id, number: 1, description: 'First cut \n with notes', overrides: before.overrides }], "the version holds the Draft's document as stored");
    assert.deepEqual(storedDraft(id), { overrides: before.overrides, revision: before.revision + 1, origin_id: first.version.id }, 'the values stay; the revision rises and the new version is the origin');
    assert.deepEqual(first.draft, { ...await view(session, id) }, 'the answer is the Draft as it is now');
    assert.deepEqual(first.draft.origin, origin(first.ruleset, first.version, false));
    assert.equal(storedLive(id), undefined, 'saving never applies');

    // The next version: highest + 1, with no description.
    await save(session, id, { Character: { MaxWalkSpeed: 500 } });
    const second = await saved(session, id, { rulesetId: first.ruleset.id }, '   ');
    assert.deepEqual([second.ruleset, second.version.number, second.version.description], [first.ruleset, 2, null]);
    assert.equal(second.draft.origin!.versionId, second.version.id);
    storeVersion(first.ruleset.id, {});
    platformStore().run('UPDATE ruleset_versions SET number = 7 WHERE number = 3');
    const fourth = await saved(session, id, { rulesetId: first.ruleset.id });
    assert.equal(fourth.version.number, 8, 'the next number is the highest + 1');
    const other = await saved(session, id, { name: 'Duel' });
    assert.equal(other.version.number, 1, "each Ruleset numbers its own versions");
    assert.deepEqual((await list(session)).map(ruleset => [ruleset.name, ruleset.versions.map(version => version.number)]), [['Competitive', [8, 7, 2, 1]], ['Duel', [1]]], 'by name, versions newest first, never their values');
    assert.equal(JSON.stringify(await list(session)).includes('MaxWalkSpeed'), false);

    // Refusals change nothing.
    const versions = versionRows().length, { revision } = storedDraft(id);
    const refused = async (body: Record<string, unknown>, status: number, error: string) =>
      assert.deepEqual(await saveVersion(session, id, body), { status, cache: 'no-store', body: { success: false, error } }, JSON.stringify(body));
    await refused({ revision, name: 'COMPETITIVE' }, 409, 'You already have a Ruleset called Competitive');
    const shape = 'Send the revision the save is based on, and either the Ruleset to add a version to or the name of a new one';
    await refused({ revision, rulesetId: first.ruleset.id, name: 'Both' }, 400, shape);
    await refused({ revision }, 400, shape);
    await refused({ name: 'No revision' }, 400, shape);
    await refused({ revision, name: '  ' }, 400, 'Give the Ruleset a name');
    await refused({ revision, name: 'x'.repeat(65) }, 400, 'Keep the name to 64 characters or fewer');
    await refused({ revision, name: 'Line\u0007break' }, 400, 'The name cannot contain control characters');
    await refused({ revision, name: 'Long', description: 'x'.repeat(501) }, 400, 'Keep the description to 500 characters or fewer');
    await refused({ revision, name: 'Typed', description: 5 }, 400, 'The description must be text');
    await refused({ revision, rulesetId: 999 }, 404, 'No such Ruleset');
    await refused({ revision, rulesetId: 'abc' }, 404, 'No such Ruleset');
    assert.deepEqual([versionRows().length, rulesetRows().length, storedDraft(id).revision], [versions, 2, revision]);
    break;
  }
  case 'load': {
    // Another game server's version, holding a key that moved category, retired keys and a retired weapon class.
    const source = await register(session, 'Source');
    const { ruleset } = await saved(session, source, { name: 'Competitive' });
    const versionId = storeVersion(ruleset.id, {
      Character: { MaxWalkSpeed: 450, ForwardParryLength: 50, RetiredKey: 1, CustomFOV: true, CustomFOVMax: 120.5 },
      Weapon: { ArmingSword: { Strike: { Windup: 0.5, RetiredAttackKey: 2 } }, Claymore: { Strike: { Windup: 0.4 } } },
    });
    await save(session, id, { Character: { CanDodge: false } });
    platformStore().run("UPDATE drafts SET overrides = json_set(overrides, '$.Character.OwnRetiredKey', 3) WHERE game_server_id = ?", id);
    const live = apply(id);
    const before = storedDraft(id);
    const result = await loaded(session, id, versionId);
    assert.equal(result.dropped, 3, 'the retired keys and the retired weapon class are dropped, and counted');
    assert.deepEqual(result.draft.values, {
      character: { Movement: { MaxWalkSpeed: 450 }, Parry: { ForwardParryLength: 50 }, Camera: { CustomFOV: true, CustomFOVMax: 120.5 } },
      weapons: { ArmingSword: { Strike: { Windup: 0.5 } } },
    }, "each value is placed under its key's current category, over the whole Draft");
    assert.deepEqual(result.errors, [{ database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: result.errors[0]?.error }], 'a loaded value the schema refuses is named');
    assert.match(result.errors[0].error, /whole/);
    assert.deepEqual(JSON.parse(storedDraft(id).overrides), { Character: { MaxWalkSpeed: 450, ForwardParryLength: 50, CustomFOV: true, CustomFOVMax: 120.5 }, Weapon: { ArmingSword: { Strike: { Windup: 0.5 } } } }, "the Draft's own values go too");
    assert.deepEqual([storedDraft(id).revision, storedDraft(id).origin_id], [before.revision + 1, versionId], 'the revision rises and the version is the origin');
    assert.deepEqual([result.draft.dropped, result.draft.origin], [0, origin(ruleset, { id: versionId, number: 2 }, false)]);
    assert.equal(versionRows().find(row => row.id === versionId)!.overrides.includes('RetiredKey'), true, 'the version is never rewritten');
    assert.deepEqual(storedLive(id), { id: live, overrides: JSON.stringify({ Character: { CanDodge: false, OwnRetiredKey: 3 } }), origin_id: null }, 'nothing goes live until Apply');
    // One version loads into several of the owner's game servers.
    const third = await register(session, 'Third');
    assert.equal((await loaded(session, third, versionId)).draft.origin!.versionId, versionId);
    assert.equal(storedDraft(third).overrides, storedDraft(id).overrides);
    // Refusals.
    const { revision } = storedDraft(id);
    const shape = { status: 400, cache: 'no-store', body: { success: false, error: 'Send the revision the load is based on and the Ruleset version to load' } };
    assert.deepEqual(await loadVersion(session, id, { versionId }), shape);
    assert.deepEqual(await loadVersion(session, id, { revision }), shape);
    for (const missing of [999, 'abc', 0]) {
      assert.deepEqual(await loadVersion(session, id, { revision, versionId: missing }), { status: 404, cache: 'no-store', body: { success: false, error: 'No such Ruleset version' } }, String(missing));
    }
    assert.equal(storedDraft(id).revision, revision);
    break;
  }
  case 'modified': {
    await save(session, id, DOCUMENT);
    const { ruleset, version } = await saved(session, id, { name: 'Competitive' });
    const unmodified = origin(ruleset, version, false), modified = origin(ruleset, version, true);
    assert.deepEqual([(await server(session, id)).draftOrigin, (await server(session, id)).liveOrigin], [unmodified, null]);
    // An edit makes the Draft modified, and the save says so; putting the value back makes it unmodified again.
    assert.deepEqual((await save(session, id, { ...DOCUMENT, Character: { ...DOCUMENT.Character, MaxWalkSpeed: 460 } })).origin, modified);
    assert.deepEqual((await view(session, id)).origin, modified);
    assert.deepEqual((await save(session, id, DOCUMENT)).origin, unmodified);
    // An override equal to its game default is not the same as no override.
    const dodge = lookupDefault('Character', 'Movement', 'CanDodge').defaultValue;
    assert.equal(typeof dodge, 'boolean');
    assert.deepEqual((await save(session, id, { ...DOCUMENT, Character: { ...DOCUMENT.Character, CanDodge: dodge } })).origin, modified, 'a pinned game default is a change');
    assert.deepEqual((await save(session, id, { Weapon: DOCUMENT.Weapon, Character: { ForwardParryLength: 50, MaxWalkSpeed: 450 } })).origin, unmodified, 'key order is no change');
    // Values the schema has no place for never count, in the Draft or the version.
    platformStore().run("UPDATE drafts SET overrides = json_set(overrides, '$.Character.RetiredKey', 1) WHERE game_server_id = ?", id);
    assert.deepEqual((await view(session, id)).origin, unmodified);
    platformStore().run("UPDATE ruleset_versions SET overrides = json_set(overrides, '$.Weapon.Claymore', json('{\"Windup\":1}')) WHERE id = ?", version.id);
    assert.deepEqual((await view(session, id)).origin, unmodified);

    // Apply copies the origin; each configuration is compared with it on its own.
    apply(id);
    assert.deepEqual([(await server(session, id)).draftOrigin, (await server(session, id)).liveOrigin], [unmodified, unmodified]);
    await save(session, id, { Character: { MaxWalkSpeed: 600 } });
    assert.deepEqual([(await server(session, id)).draftOrigin, (await server(session, id)).liveOrigin], [modified, unmodified]);
    // Discard changes takes the Live configuration's values and origin; a new version and Reset then move the Draft's alone.
    const next = await saved(session, id, { rulesetId: ruleset.id });
    assert.deepEqual((await server(session, id)).draftOrigin, origin(ruleset, next.version, false));
    const discarded = await answer<DraftView>(await discardRoute.POST(session.request(`${draftUrl(id)}/discard`, json('POST', { revision: storedDraft(id).revision })), at(id)));
    assert.deepEqual([discarded.status, discarded.body.data!.origin], [200, unmodified]);
    apply(id);
    await save(session, id, { Character: { MaxWalkSpeed: 600 } });
    const reset = await answer<DraftView>(await resetRoute.POST(session.request(`${draftUrl(id)}/reset`, json('POST', { revision: storedDraft(id).revision })), at(id)));
    assert.deepEqual([reset.status, reset.body.data!.origin, storedDraft(id).origin_id], [200, null, null], 'Reset to game defaults clears the origin');
    assert.deepEqual([(await server(session, id)).draftOrigin, (await server(session, id)).liveOrigin], [null, unmodified]);
    break;
  }
  case 'rename': {
    const { ruleset } = await saved(session, id, { name: 'Competitive' });
    const { ruleset: duel } = await saved(session, id, { name: 'Duel' });
    assert.deepEqual(await rename(session, ruleset.id, ' Ranked '), { status: 200, cache: 'no-store', body: { success: true, data: { id: ruleset.id, name: 'Ranked' } } });
    assert.deepEqual((await list(session)).map(entry => entry.name), ['Duel', 'Ranked']);
    assert.equal((await view(session, id)).origin!.rulesetId, duel.id, "the Draft's origin is Duel's version 1, saved last");
    const refused = (status: number, error: string) => ({ status, cache: 'no-store', body: { success: false, error } });
    assert.deepEqual(await rename(session, ruleset.id, 'DUEL'), refused(409, 'You already have a Ruleset called Duel'), 'unique among the owner\'s, ignoring case');
    assert.deepEqual(await rename(session, ruleset.id, 'RANKED'), { status: 200, cache: 'no-store', body: { success: true, data: { id: ruleset.id, name: 'RANKED' } } }, 'its own name in another case');
    assert.deepEqual(await rename(session, duel.id, 'ranked'), refused(409, 'You already have a Ruleset called RANKED'));
    assert.deepEqual(await rename(session, duel.id, ''), refused(400, 'Give the Ruleset a name'));
    assert.deepEqual(await rename(session, duel.id, 7), refused(400, 'Give the Ruleset a name'));
    assert.deepEqual(await rename(session, duel.id, 'x'.repeat(65)), refused(400, 'Keep the name to 64 characters or fewer'));
    for (const missing of [999, 'abc', '0']) assert.deepEqual(await rename(session, missing, 'Fine'), refused(404, 'No such Ruleset'), String(missing));
    // The origin follows the new name; versions keep their numbers.
    assert.equal((await rename(session, duel.id, 'Duel EU')).status, 200);
    assert.deepEqual((await view(session, id)).origin, { rulesetId: duel.id, rulesetName: 'Duel EU', versionId: versionRows()[1].id, number: 1, modified: false });
    // Another owner may use the same names.
    const other = await signInForTest('Other owner');
    const theirs = await register(other, 'Theirs');
    assert.equal((await saved(other, theirs, { name: 'ranked' })).ruleset.name, 'ranked');
    other.close();
    break;
  }
  case 'delete': {
    const second = await register(session, 'Second');
    await save(session, id, DOCUMENT);
    const { ruleset, version: first } = await saved(session, id, { name: 'Competitive' });
    const live = apply(id);
    await save(session, id, { Character: { MaxWalkSpeed: 600 } });
    const { version: next } = await saved(session, id, { rulesetId: ruleset.id });
    const { ruleset: kept, version: keptVersion } = await saved(session, second, { name: 'Duel' });
    const before = { draft: storedDraft(id), live: storedLive(id)!, second: storedDraft(second) };
    assert.deepEqual([before.draft.origin_id, before.live.origin_id], [next.id, first.id]);

    // Another owner cannot delete it.
    const other = await signInForTest('Other owner');
    assert.deepEqual(await remove(other, ruleset.id), { status: 404, cache: 'no-store', body: { success: false, error: 'No such Ruleset' } });
    other.close();
    assert.equal(rulesetRows().length, 2);

    assert.deepEqual(await remove(session, ruleset.id), { status: 200, cache: 'no-store', body: { success: true } });
    assert.deepEqual(rulesetRows().map(row => row.id), [kept.id]);
    assert.deepEqual(versionRows().map(row => row.id), [keptVersion.id], 'its versions go with it');
    assert.deepEqual(storedDraft(id), { ...before.draft, origin_id: null }, "the Draft keeps its values and revision, and has no origin");
    assert.deepEqual(storedLive(id), { ...before.live, id: live, origin_id: null }, 'so does the Live configuration, under the same id');
    assert.deepEqual(storedDraft(second), before.second, "another Ruleset's origin stays");
    assert.deepEqual([(await server(session, id)).draftOrigin, (await server(session, id)).liveOrigin], [null, null]);
    assert.deepEqual((await list(session)).map(entry => entry.name), ['Duel']);
    for (const missing of [ruleset.id, 'abc']) assert.equal((await remove(session, missing)).status, 404, String(missing));
    break;
  }
  case 'privacy': {
    const { ruleset, version } = await saved(session, id, { name: 'Competitive' });
    const other = await signInForTest('Other owner');
    const theirs = await register(other, 'Theirs');
    await save(other, theirs, { Character: { MaxWalkSpeed: 600 } });
    const before = { mine: storedDraft(id), theirs: storedDraft(theirs) };
    assert.deepEqual(await list(other), [], "another owner's Rulesets are not listed");
    const { revision } = before.theirs;
    // Another owner's Ruleset or version reads as missing, into their own Draft too.
    assert.deepEqual(await loadVersion(other, theirs, { revision, versionId: version.id }), { status: 404, cache: 'no-store', body: { success: false, error: 'No such Ruleset version' } });
    assert.deepEqual(await saveVersion(other, theirs, { revision, rulesetId: ruleset.id }), { status: 404, cache: 'no-store', body: { success: false, error: 'No such Ruleset' } });
    assert.equal((await rename(other, ruleset.id, 'Taken over')).status, 404);
    // Nor can they write to my game server's Draft.
    const missingServer = { status: 404, cache: 'no-store', body: { success: false, error: 'No such game server' } };
    assert.deepEqual(await loadVersion(other, id, { revision: before.mine.revision, versionId: version.id }), missingServer);
    assert.deepEqual(await saveVersion(other, id, { revision: before.mine.revision, name: 'Stolen' }), missingServer);
    for (const target of [999, 'abc']) {
      assert.deepEqual(await loadVersion(session, target, { revision: 0, versionId: version.id }), missingServer);
      assert.deepEqual(await saveVersion(session, target, { revision: 0, name: 'Nowhere' }), missingServer);
    }
    assert.deepEqual([storedDraft(id), storedDraft(theirs)], [before.mine, before.theirs]);
    assert.deepEqual(rulesetRows().map(row => [row.name, row.owner_id]), [['Competitive', session.userId]]);
    // The same name is theirs to use: names are unique per owner.
    assert.equal((await saved(other, theirs, { name: 'Competitive' })).version.number, 1);
    assert.deepEqual((await list(session)).map(entry => entry.versions.length), [1]);
    // Signed out, or a write from another origin.
    const signedOut = (path: string, init?: RequestInit) => new Request(new URL(path, env.publicUrl), { ...init, headers: { 'Content-Type': 'application/json', Origin: session.origin } });
    assert.equal((await rulesetsRoute.GET(signedOut('/api/rulesets'))).status, 401);
    assert.equal((await loadRoute.POST(signedOut(`${draftUrl(id)}/load`, json('POST', { revision: before.mine.revision, versionId: version.id })), at(id))).status, 401);
    assert.equal((await rulesetRoute.DELETE(signedOut(`/api/rulesets/${ruleset.id}`, { method: 'DELETE' }), at(ruleset.id))).status, 401);
    const foreign = (path: string, method: string, body: unknown) => new Request(new URL(path, env.publicUrl), { ...json(method, body), headers: { 'Content-Type': 'application/json', Cookie: session.cookie, Origin: 'https://elsewhere.test' } });
    assert.equal((await saveVersionRoute.POST(foreign(`${draftUrl(id)}/save-version`, 'POST', { revision: storedDraft(id).revision, name: 'Forged' }), at(id))).status, 403);
    assert.equal((await rulesetRoute.DELETE(foreign(`/api/rulesets/${ruleset.id}`, 'DELETE', {}), at(ruleset.id))).status, 403);
    assert.equal((await rulesetRoute.PATCH(foreign(`/api/rulesets/${ruleset.id}`, 'PATCH', { name: 'Forged' }), at(ruleset.id))).status, 403);
    assert.equal(rulesetRows().filter(row => row.owner_id === session.userId).map(row => row.name).join(), 'Competitive');
    other.close();
    break;
  }
  case 'stale': {
    await save(session, id, DOCUMENT);
    const { ruleset, version } = await saved(session, id, { name: 'Competitive' });
    await save(session, id, { Character: { MaxWalkSpeed: 600 } });
    const current = await view(session, id);
    const before = { draft: storedDraft(id), versions: versionRows(), rulesets: rulesetRows() };
    const refusal = { status: 409, cache: 'no-store', body: { success: false, error: STALE, data: current } };
    // Another tab's write left the Draft at a newer revision; one the Draft never had is stale too.
    for (const revision of [current.revision - 1, current.revision + 5]) {
      assert.deepEqual(await saveVersion(session, id, { revision, rulesetId: ruleset.id }), refusal, `save on ${revision}`);
      assert.deepEqual(await saveVersion(session, id, { revision, name: 'New one' }), refusal, `save as new on ${revision}`);
      assert.deepEqual(await loadVersion(session, id, { revision, versionId: version.id }), refusal, `load on ${revision}`);
    }
    assert.deepEqual({ draft: storedDraft(id), versions: versionRows(), rulesets: rulesetRows() }, before, 'a stale save creates no Ruleset or version, and a stale load loads nothing');
    // Two tabs write on the same revision at once: exactly one is written, and the other is refused with the Draft the first left.
    const race = async (writes: ((revision: number) => Promise<{ status: number; body: unknown }>)[]) => {
      const { revision } = storedDraft(id);
      const answers = await Promise.all(writes.map(write => write(revision)));
      const refused = answers.filter(({ status }) => status === 409);
      assert.equal(refused.length, 1, 'exactly one write is refused');
      assert.equal(storedDraft(id).revision, revision + 1, 'the Draft moved on once');
      assert.deepEqual(refused[0].body, { success: false, error: STALE, data: await view(session, id) });
      return answers.map(({ status }) => status);
    };
    const [loadStatus] = await race([revision => loadVersion(session, id, { revision, versionId: version.id }), revision => saveVersion(session, id, { revision, rulesetId: ruleset.id })]);
    assert.equal(versionRows().length, before.versions.length + (loadStatus === 200 ? 0 : 1), "the refused save's version is not created");
    const [saveStatus] = await race([
      revision => saveVersion(session, id, { revision, name: 'Raced' }),
      async revision => answer(await draftRoute.PUT(session.request(draftUrl(id), json('PUT', { revision, document: { Character: { MaxWalkSpeed: 610 } } })), at(id))),
    ]);
    assert.equal(rulesetRows().some(row => row.name === 'Raced'), saveStatus === 201, "the refused save's Ruleset is not created");
    break;
  }
  default:
    throw new Error(`Unknown scenario ${process.argv[2]}`);
}
session.close();
console.log(JSON.stringify({ fixture: 'passed' }));
