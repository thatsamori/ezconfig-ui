/**
 * Ruleset files through the route handlers: export, the import's review and
 * commit, a round trip, refused files, dropped values, a taken name, and privacy
 * between owners. One scenario per run (argv[2]), each in its own process with
 * the env set by tests/platform-ruleset-files.test.ts. Asserts as it goes.
 */
import assert from 'node:assert/strict';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { DraftView } from '../../src/lib/platform/drafts';
import type { ImportReview, RulesetSummary, RulesetVersionSummary } from '../../src/lib/platform/rulesets';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const { applyDraft } = await import('../../src/lib/platform/live-configurations');
const { RULESET_FILE_LIMIT, RULESET_FILE_TOO_LARGE, writeRulesetFile } = await import('../../src/lib/config/rulesetFile');
const { encodeValues } = await import('../../src/lib/config/encodeValues');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const draftRoute = await import('../../src/app/api/game-servers/[id]/draft/route');
const saveVersionRoute = await import('../../src/app/api/game-servers/[id]/draft/save-version/route');
const loadRoute = await import('../../src/app/api/game-servers/[id]/draft/load/route');
const rulesetsRoute = await import('../../src/app/api/rulesets/route');
const exportRoute = await import('../../src/app/api/rulesets/[id]/versions/[versionId]/export/route');
const importRoute = await import('../../src/app/api/rulesets/import/route');

type Saved = { ruleset: { id: number; name: string }; version: RulesetVersionSummary };
type Imported = Saved & { values: number; dropped: number };
type Body<Data> = { success: boolean; error?: string; data?: Data };

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const at = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const answer = async <Data>(response: Response) => ({ status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Body<Data> });

async function register(session: TestSession, name: string): Promise<number> {
  const response = await gameServersRoute.POST(session.request('/api/game-servers', json('POST', { name })));
  assert.equal(response.status, 201);
  return (await response.json()).data.gameServer.id;
}
async function view(session: TestSession, id: number): Promise<DraftView> {
  const response = await draftRoute.GET(session.request(`/api/game-servers/${id}/draft`), at(id));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function save(session: TestSession, id: number, document: unknown) {
  const { revision } = await view(session, id);
  const response = await draftRoute.PUT(session.request(`/api/game-servers/${id}/draft`, json('PUT', { revision, document })), at(id));
  assert.equal(response.status, 200, 'the Draft saves');
}
async function saved(session: TestSession, id: number, target: { rulesetId: number } | { name: string }, description?: string): Promise<Saved> {
  const { revision } = await view(session, id);
  const { status, body } = await answer<Saved>(await saveVersionRoute.POST(session.request(`/api/game-servers/${id}/draft/save-version`, json('POST', { revision, ...target, description })), at(id)));
  assert.equal(status, 201, JSON.stringify(body));
  return body.data!;
}
/** Loads a version into a Draft; the Draft's values and its stored document are what a round trip compares. */
async function loaded(session: TestSession, id: number, versionId: number) {
  const { revision } = await view(session, id);
  const { status, body } = await answer<{ draft: DraftView; dropped: number; errors: unknown[] }>(await loadRoute.POST(session.request(`/api/game-servers/${id}/draft/load`, json('POST', { revision, versionId })), at(id)));
  assert.equal(status, 200, JSON.stringify(body));
  return { values: body.data!.draft.values, dropped: body.data!.dropped, errors: body.data!.errors, document: JSON.parse(storedDraft(id).overrides) as unknown };
}
const exported = (session: TestSession, rulesetId: number | string, versionId: number | string) =>
  exportRoute.GET(session.request(`/api/rulesets/${rulesetId}/versions/${versionId}/export`), { params: Promise.resolve({ id: String(rulesetId), versionId: String(versionId) }) });
async function exportedText(session: TestSession, saved: Saved) {
  const response = await exported(session, saved.ruleset.id, saved.version.id);
  assert.equal(response.status, 200);
  return response.text();
}
const importing = async <Data>(session: TestSession, body: unknown) => answer<Data>(await importRoute.POST(session.request('/api/rulesets/import', json('POST', body))));
const review = (session: TestSession, file: string, name?: string) => importing<ImportReview>(session, { file, name });
const commit = (session: TestSession, file: string, name?: string) => importing<Imported>(session, { file, name, commit: true });
/** Imports a file, which must succeed. */
async function imported(session: TestSession, file: string, name?: string): Promise<Imported> {
  const { status, cache, body } = await commit(session, file, name);
  assert.deepEqual([status, cache], [201, 'no-store'], JSON.stringify(body));
  return body.data!;
}
async function list(session: TestSession): Promise<RulesetSummary[]> {
  const response = await rulesetsRoute.GET(session.request('/api/rulesets'));
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
const fileOf = (fields: Record<string, unknown>) => JSON.stringify({ format: 'ezconfig-ruleset', formatVersion: 1, name: 'From a friend', description: null, values: {}, ...fields });
const storedDraft = (id: number) => platformStore().get<{ overrides: string; revision: number; origin_id: number | null }>('SELECT overrides, revision, origin_id FROM drafts WHERE game_server_id = ?', id)!;
const everything = () => ['rulesets', 'ruleset_versions', 'drafts', 'live_configurations', 'game_servers', 'notes'].map(table => platformStore().all(`SELECT * FROM ${table} ORDER BY 1`));
const versionRows = () => platformStore().all<{ ruleset_id: number; number: number; description: string | null; overrides: string }>('SELECT ruleset_id, number, description, overrides FROM ruleset_versions ORDER BY id');

const session = await signInForTest('First owner');
const friend = await signInForTest('Second owner');
const id = await register(session, 'Duel EU');
/** Every kind of value, under each place a document holds them. */
const DOCUMENT = {
  Character: { MaxWalkSpeed: 450.125, ForwardParryLength: 50, CanDodge: false, CustomFOV: true, CustomFOVMax: 120 },
  Weapon: {
    ArmingSword: { ParryTurnCap: { x: 375, y: 262.5 }, ClashNormal: { x: 0, y: -1, z: 0 }, Strike: { Windup: 0.5, Damage: [50, 45.5, 40] }, Stab: { Windup: 0.25 } },
    Greatsword: { AltStrike: { Windup: 0.675 } },
  },
};

switch (process.argv[2]) {
  case 'round-trip': {
    await save(session, id, { Character: { MaxWalkSpeed: 500 } });
    const first = await saved(session, id, { name: 'Competitive' }, 'Older cut');
    await save(session, id, DOCUMENT);
    const second = await saved(session, id, { rulesetId: first.ruleset.id }, ' Line one\r\nline two ');

    // Exporting a version: the file, its headers, and exactly what it holds.
    const response = await exported(session, second.ruleset.id, second.version.id);
    assert.deepEqual([response.status, response.headers.get('Cache-Control'), response.headers.get('Content-Type'), response.headers.get('X-Content-Type-Options')], [200, 'no-store', 'application/json; charset=utf-8', 'nosniff']);
    assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="Competitive version 2.json"; filename*=UTF-8''Competitive%20version%202.json`);
    const text = await response.text();
    const file = JSON.parse(text) as Record<string, unknown>;
    assert.deepEqual(file, { format: 'ezconfig-ruleset', formatVersion: 1, name: 'Competitive', description: 'Line one\nline two', values: DOCUMENT }, 'the marker, the name, the description and the values, and nothing else');
    for (const secret of [session.name, String(session.userId), 'Duel EU', 'ezc_gsk_']) assert.equal(text.includes(`"${secret}`), false, secret);
    // Each version exports its own values.
    assert.deepEqual(JSON.parse(await exportedText(session, first)), { format: 'ezconfig-ruleset', formatVersion: 1, name: 'Competitive', description: 'Older cut', values: { Character: { MaxWalkSpeed: 500 } } });

    // Choosing the file writes nothing, and says what it holds.
    const before = everything();
    assert.deepEqual(await review(friend, text), {
      status: 200, cache: 'no-store',
      body: { success: true, data: { name: 'Competitive', description: 'Line one\nline two', takenBy: null, values: 11, dropped: 0, droppedValues: [] } },
    });
    assert.deepEqual(everything(), before, 'a review writes nothing');

    // Importing makes version 1 of a new Ruleset, and changes no Draft, Live configuration or game server.
    const theirs = await register(friend, 'Friend server');
    await save(friend, theirs, { Character: { CanDodge: true } });
    const live = applyDraft(theirs, { revision: storedDraft(theirs).revision, liveConfigurationId: null });
    assert(live?.ok, 'applied');
    const untouched = () => ['game_servers', 'drafts', 'live_configurations'].map(table => platformStore().all(`SELECT * FROM ${table} ORDER BY 1`));
    const unchanged = untouched();
    const result = await imported(friend, text);
    assert.deepEqual(untouched(), unchanged, 'no Draft, Live configuration or game server changes');
    assert.deepEqual([result.ruleset.name, result.version.number, result.version.description, result.values, result.dropped], ['Competitive', 1, 'Line one\nline two', 11, 0]);
    assert.deepEqual((await list(friend)).map(entry => [entry.id, entry.name, entry.versions.map(version => version.number)]), [[result.ruleset.id, 'Competitive', [1]]], 'it is version 1 of a new Ruleset, whatever number it left as');
    assert.deepEqual((await list(session)).map(entry => entry.versions.length), [2], "the exporter's Ruleset is as it was");

    // Loading the import gives the same Draft as loading the original.
    const original = await loaded(session, id, second.version.id);
    const copy = await loaded(friend, theirs, result.version.id);
    assert.deepEqual(copy, original);
    assert.deepEqual(original.document, DOCUMENT);

    // Exporting the import gives the same file back.
    assert.equal(await exportedText(friend, result), text);

    // A byte order mark, as some editors add, and other spacing read the same.
    assert.equal((await review(friend, `﻿${JSON.stringify(file)}`, 'Other')).body.data!.values, 11);

    // An empty version round-trips too.
    await save(session, id, {});
    const empty = await saved(session, id, { name: 'Empty' });
    const emptyImport = await imported(friend, await exportedText(session, empty));
    assert.deepEqual([emptyImport.values, emptyImport.version.description], [0, null]);
    assert.deepEqual((await loaded(friend, theirs, emptyImport.version.id)).document, {});
    break;
  }
  case 'filename': {
    // A name the rules allow can hold quotes, separators and direction-changing characters: none reaches the header.
    await save(session, id, { Character: { CanDodge: false } });
    const { ruleset, version } = await saved(session, id, { name: 'First' });
    const disposition = async () => {
      const response = await exported(session, ruleset.id, version.id);
      assert.equal(response.status, 200);
      return response.headers.get('Content-Disposition')!;
    };
    const named = (name: string) => platformStore().run('UPDATE rulesets SET name = ?, name_key = ? WHERE id = ?', name, name.toLowerCase(), ruleset.id);
    const cases: [string, string, string][] = [
      ['Duel: "EU"/NA\\;x', 'Duel- -EU-NA-x version 1.json', 'Duel-%20-EU-NA-x%20version%201.json'],
      ['../../etc/passwd', 'etc-passwd version 1.json', 'etc-passwd%20version%201.json'],
      ['evil.json"; filename="other.exe', 'evil-json- filename-other-exe version 1.json', 'evil-json-%20filename-other-exe%20version%201.json'],
      ['Règles été', 'R-gles -t version 1.json', 'R%C3%A8gles%20%C3%A9t%C3%A9%20version%201.json'],
      ['日本語', 'Ruleset version 1.json', '%E6%97%A5%E6%9C%AC%E8%AA%9E%20version%201.json'],
      ['abc‮gnp.exe', 'abc-gnp-exe version 1.json', 'abc-gnp-exe%20version%201.json'],
      ['!!!', 'Ruleset version 1.json', 'Ruleset%20version%201.json'],
      // Control characters are refused by the name rules, so these are only ever stored by hand; the header still holds.
      ['Line\r\nSet-Cookie: x=1', 'Line-Set-Cookie- x-1 version 1.json', 'Line-Set-Cookie-%20x-1%20version%201.json'],
    ];
    for (const [name, ascii, full] of cases) {
      named(name);
      assert.equal(await disposition(), `attachment; filename="${ascii}"; filename*=UTF-8''${full}`, JSON.stringify(name));
    }
    break;
  }
  case 'refused': {
    await save(session, id, { Character: { CanDodge: false } });
    await saved(session, id, { name: 'Mine' });
    const before = everything();
    // Refused alike when reviewing and when importing.
    const refused = async (body: unknown, status: number, error: string) => {
      for (const send of [body, { ...(body as object), commit: true }]) {
        assert.deepEqual(await importing(session, send), { status, cache: 'no-store', body: { success: false, error } }, JSON.stringify(send).slice(0, 200));
      }
    };
    const NOT_A_FILE = 'This file is not a Ruleset file exported from EZConfig';
    const BAD_FORM = 'This Ruleset file is not in the expected form, so it may have been edited or damaged';
    // Not the request.
    for (const send of [{}, { file: 5 }, { file: { format: 'ezconfig-ruleset' } }, { name: 'Only' }]) await refused(send, 400, 'Send the text of the Ruleset file');
    const notJson = await importRoute.POST(session.request('/api/rulesets/import', { method: 'POST', body: 'not json' }));
    assert.deepEqual((await answer(notJson)).body, { success: false, error: 'Send the text of the Ruleset file' });
    // Not JSON, or not this format.
    for (const file of ['', 'not json', '{"format":', '<html></html>']) await refused({ file }, 400, `${NOT_A_FILE}: it is not valid JSON`);
    for (const file of ['null', '5', '"text"', '[]', '{}', JSON.stringify({ Character: { CanDodge: true } }), fileOf({ format: 'other' }), fileOf({ format: undefined })]) await refused({ file }, 400, NOT_A_FILE);
    // A format version this build cannot read, or not one at all.
    await refused({ file: fileOf({ formatVersion: 2 }) }, 400, 'This Ruleset file is format version 2, and the platform reads up to version 1');
    for (const formatVersion of [0, -1, 1.5, '1', null, undefined]) await refused({ file: fileOf({ formatVersion }) }, 400, BAD_FORM);
    // Anything else in it, or values not shaped as a document. Nothing but what the format holds is read.
    await refused({ file: fileOf({ owner: 'Someone' }) }, 400, BAD_FORM);
    await refused({ file: fileOf({ gameServerKey: 'x' }) }, 400, BAD_FORM);
    await refused({ file: fileOf({}).replace('{', '{"__proto__":{"polluted":true},') }, 400, BAD_FORM);
    for (const values of [undefined, null, 5, [], 'x', { Horse: {} }, { Character: 5 }, { Character: [] }, { Weapon: 5 }, { Weapon: { ArmingSword: 5 } }, { Weapon: { ArmingSword: [] } }]) await refused({ file: fileOf({ values }) }, 400, BAD_FORM);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    // A name or description the platform would refuse: an export never holds one.
    await refused({ file: fileOf({ name: undefined }) }, 400, "This Ruleset file's name cannot be used: Give the Ruleset a name");
    await refused({ file: fileOf({ name: '   ' }) }, 400, "This Ruleset file's name cannot be used: Give the Ruleset a name");
    await refused({ file: fileOf({ name: 5 }) }, 400, "This Ruleset file's name cannot be used: Give the Ruleset a name");
    await refused({ file: fileOf({ name: 'x'.repeat(65) }) }, 400, "This Ruleset file's name cannot be used: Keep the name to 64 characters or fewer");
    await refused({ file: fileOf({ name: 'Line\nbreak' }) }, 400, "This Ruleset file's name cannot be used: The name cannot contain control characters");
    await refused({ file: fileOf({ description: 5 }) }, 400, "This Ruleset file's description cannot be used: The description must be text");
    await refused({ file: fileOf({ description: 'x'.repeat(501) }) }, 400, "This Ruleset file's description cannot be used: Keep the description to 500 characters or fewer");
    await refused({ file: fileOf({ description: 'bell\u0007' }) }, 400, "This Ruleset file's description cannot be used: The description cannot contain control characters");
    // Too large: the file itself, and the request around it. Nothing is parsed.
    await refused({ file: fileOf({ description: 'x'.repeat(RULESET_FILE_LIMIT) }) }, 413, RULESET_FILE_TOO_LARGE);
    const oversized = await importRoute.POST(session.request('/api/rulesets/import', { method: 'POST', body: 'x'.repeat(2 * RULESET_FILE_LIMIT + 1025) }));
    assert.deepEqual((await answer(oversized)).status, 413);
    // Nesting as deep as the limit allows is an answer, never a crash; a value that deep is refused and goes no further.
    const depth = 300_000;
    const deep = await importing<ImportReview>(session, { file: fileOf({ values: { Character: { MaxWalkSpeed: 450 } } }).replace('450', `${'['.repeat(depth)}${']'.repeat(depth)}`) });
    assert(deep.status === 200 || deep.status === 400, `deep nesting answered ${deep.status}`);
    assert.equal(deep.status === 200 ? deep.body.data!.values : 0, 0);
    assert.deepEqual(everything(), before, 'a refused file writes nothing');
    break;
  }
  case 'dropped': {
    // One of every kind that must go, beside values that stay.
    const huge = 'K'.repeat(5000);
    const file = fileOf({
      values: {
        Character: {
          MaxWalkSpeed: 450, RetiredKey: 1, __proto__x: 1, CanDodge: 'yes', ChftpStunAnimation: 'Nope', CustomFOVMax: 120.5, ForwardParryLength: null,
          [huge]: 1,
        },
        Weapon: {
          ArmingSword: { Strike: { Windup: 0.5, RetiredAttackKey: 2, Damage: [1, 'two'] }, Windup: 0.5, RetiredGeneralKey: 3, ParryTurnCap: { x: 1, y: 2, z: 3 }, ClashNormal: { x: 1, y: 2, z: 3, extra: [[['hidden']]] } },
          Claymore: { Strike: { Windup: 0.4 }, General: 1 },
        },
      },
    }).replace('"__proto__x"', '"__proto__"');
    const { status, body } = await review(friend, file);
    assert.equal(status, 200, JSON.stringify(body));
    const shown = body.data!;
    assert.equal(shown.values, 2, 'MaxWalkSpeed and ArmingSword Strike Windup stay');
    assert.equal(shown.dropped, 15);
    assert.equal(shown.droppedValues.length, 15);
    const reasons = Object.fromEntries(shown.droppedValues.filter(({ key }) => key.length < 100).map(({ database, category, key, error }) => [`${database}/${category ?? '-'}/${key}`, error]));
    assert.deepEqual(reasons, {
      'Character/-/RetiredKey': 'Unknown config key',
      'Character/-/__proto__': 'Unknown config key',
      'Character/Movement/CanDodge': 'Expected Boolean, got String',
      'Character/Chftp/ChftpStunAnimation': 'Expected one of [Default], got "Nope"',
      'Character/Camera/CustomFOVMax': 'Use a whole number.',
      'Character/Parry/ForwardParryLength': 'Expected Float, got object',
      'ArmingSword/-/RetiredAttackKey': 'Unknown config key',
      'ArmingSword/Strike/Damage': 'Expected FloatArray, got Array',
      'ArmingSword/-/Windup': 'Unknown config key',
      'ArmingSword/-/RetiredGeneralKey': 'Unknown config key',
      'ArmingSword/General/ParryTurnCap': 'Expected Vector2D, got Vector',
      'ArmingSword/General/ClashNormal': 'Expected Vector, got Object',
      'Claymore/-/Windup': 'Unknown weapon class',
      'Claymore/-/General': 'Unknown weapon class',
    }, 'named with the reason');
    const long = shown.droppedValues.find(({ key }) => key.length >= 100)!;
    assert.deepEqual([long.key.length, long.key.endsWith('…')], [201, true], 'a long key is cut');

    const result = await imported(friend, file);
    assert.deepEqual([result.values, result.dropped], [2, 15]);
    assert.deepEqual(JSON.parse(versionRows().at(-1)!.overrides), { Character: { MaxWalkSpeed: 450 }, Weapon: { ArmingSword: { Strike: { Windup: 0.5 } } } }, 'only what a save would accept is stored');

    // A number too large for JSON parses to Infinity: refused anywhere, so it is never stored as null.
    const infinite = { Character: { MaxWalkSpeed: 'INF' }, Weapon: { ArmingSword: { Strike: { Damage: ['INF'] }, ParryTurnCap: { x: 'INF', y: 1 } } } };
    const overflowing = fileOf({ values: infinite, name: 'Overflow' }).replaceAll('"INF"', '1e999');
    const overflowed = (await review(friend, overflowing)).body.data!;
    assert.deepEqual([overflowed.values, overflowed.droppedValues.map(({ key, error }) => [key, error])], [0, [['MaxWalkSpeed', 'Expected Float, got Infinity'], ['Damage', 'Expected FloatArray, got Array'], ['ParryTurnCap', 'Expected Vector2D, got Object']]]);
    const draftServer = await register(friend, 'Overflow server');
    const { revision } = await view(friend, draftServer);
    const typed = await draftRoute.PUT(friend.request(`/api/game-servers/${draftServer}/draft`, { method: 'PUT', body: `{"revision":${revision},"document":{"Character":{"MaxWalkSpeed":1e999}}}` }), at(draftServer));
    assert.equal(typed.status, 400, 'a Draft save refuses it too');

    // A list is as long as an editor and a command can bear, however long the file.
    const lists = (length: number) => fileOf({ name: 'Lists', values: { Weapon: { ArmingSword: { Strike: { Damage: Array(length).fill(1) } } } } });
    assert.deepEqual([(await review(friend, lists(64))).body.data!.values, (await review(friend, lists(64))).body.data!.dropped], [1, 0]);
    assert.deepEqual((await review(friend, lists(65))).body.data!.droppedValues.map(({ key, error }) => [key, error]), [['Damage', 'Expected FloatArray, got FloatArray of 65 values, more than 64']]);

    // A file can name any number of values: the review stays small, and says how many.
    const many = Object.fromEntries(Array.from({ length: 5000 }, (_, index) => [`Retired${index}`, index]));
    const large = (await review(friend, fileOf({ name: 'Large', values: { Character: { ...many, MaxWalkSpeed: 450 } } }))).body.data!;
    assert.deepEqual([large.values, large.dropped, large.droppedValues.length], [1, 5000, 100]);

    // Every value dropped is still a file the owner can decide on: nothing refuses it, and it imports empty.
    const none = await imported(friend, fileOf({ name: 'Nothing left', values: { Character: { RetiredKey: 1 } } }));
    assert.deepEqual([none.values, none.dropped], [0, 1]);

    // A version stored with a value the schema now has no place for, or refuses, exports as stored. The import drops and reports them.
    const source = await register(session, 'Source');
    await save(session, source, { Character: { MaxWalkSpeed: 450 } });
    const old = await saved(session, source, { name: 'Old' });
    platformStore().run('UPDATE ruleset_versions SET overrides = ? WHERE id = ?', JSON.stringify({ Character: { MaxWalkSpeed: 450, RetiredKey: 1, CustomFOVMax: 120.5 } }), old.version.id);
    const oldFile = await exportedText(session, old);
    assert.deepEqual((JSON.parse(oldFile) as { values: unknown }).values, { Character: { MaxWalkSpeed: 450, RetiredKey: 1, CustomFOVMax: 120.5 } });
    const oldImport = await imported(friend, oldFile);
    assert.deepEqual([oldImport.values, oldImport.dropped], [1, 2]);
    break;
  }
  case 'name-taken': {
    const server = await register(friend, 'Friend server');
    await save(friend, server, { Character: { CanDodge: false } });
    const own = await saved(friend, server, { name: 'Competitive' });
    await saved(friend, server, { name: 'Other' });
    const file = fileOf({ name: 'COMPETITIVE', description: 'From a friend', values: { Character: { MaxWalkSpeed: 450 } } });
    // The review says so, ignoring case, and names the Ruleset that holds it.
    const shown = (await review(friend, file)).body.data!;
    assert.deepEqual([shown.name, shown.takenBy], ['COMPETITIVE', 'Competitive']);
    assert.deepEqual((await review(friend, file, 'Free')).body.data!.takenBy, null, 'a free name is not taken');
    assert.deepEqual((await review(friend, file, ' other ')).body.data!.takenBy, 'Other');
    // Importing under it is refused, and nothing is written.
    const before = everything();
    for (const name of [undefined, 'competitive', ' Competitive ', 'OTHER']) {
      const { status, cache, body } = await commit(friend, file, name);
      assert.deepEqual([status, cache, body.success], [409, 'no-store', false]);
      assert.match(body.error!, /^You already have a Ruleset called (Competitive|Other)$/);
    }
    // A name the rules refuse says why, in the rules' words.
    for (const [name, error] of [['   ', 'Give the Ruleset a name'], ['x'.repeat(65), 'Keep the name to 64 characters or fewer'], ['Bell\u0007', 'The name cannot contain control characters'], [5, 'Give the Ruleset a name'], [null, 'Give the Ruleset a name']] as const) {
      assert.deepEqual(await importing(friend, { file, name, commit: true }), { status: 400, cache: 'no-store', body: { success: false, error } }, String(name));
    }
    assert.deepEqual(everything(), before, 'nothing is written');
    // A changed name imports, trimmed, keeping the description; the owner's own Ruleset is as it was.
    const result = await imported(friend, file, '  Competitive from a friend ');
    assert.deepEqual([result.ruleset.name, result.version.number, result.version.description], ['Competitive from a friend', 1, 'From a friend']);
    assert.deepEqual((await list(friend)).map(entry => entry.name), ['Competitive', 'Competitive from a friend', 'Other']);
    assert.equal((await list(friend)).find(entry => entry.id === own.ruleset.id)!.versions.length, 1);
    // Names are unique per owner: the same file imports under its own name for another.
    assert.equal((await imported(session, file)).ruleset.name, 'COMPETITIVE');
    // Importing the same file twice is refused the second time: it is never a new version.
    await imported(session, fileOf({ name: 'Once' }));
    assert.equal((await commit(session, fileOf({ name: 'Once' }))).status, 409);
    break;
  }
  case 'release-curve': {
    const FAST_START = [0, 0, 0.2, 0.9, 1, 1];
    const STOCK = [0, 0, 0.48, 0.32, 0.63, 0.44, 0.69, 0.5, 0.79, 0.62, 0.85, 0.71, 0.93, 0.85, 1, 1];
    const CURVES = { Weapon: { Longsword: { Stab: { ReleaseCurve: FAST_START }, AltStab: { ReleaseCurve: [0, 0, 0.8, 0.1, 1, 1] } }, Rapier: { Stab: { ReleaseCurve: STOCK, Windup: 0.5 } } } };

    // Ruleset version: saved from the Draft, and loaded back exactly, with nothing dropped or refused.
    await save(session, id, CURVES);
    const version = await saved(session, id, { name: 'Curves' });
    await save(session, id, {});
    const original = await loaded(session, id, version.version.id);
    assert.deepEqual(original.document, CURVES);
    assert.deepEqual([original.dropped, original.errors], [0, []]);
    assert.deepEqual(original.values.weapons.Longsword.Stab.ReleaseCurve, FAST_START);

    // Ruleset file: exported as stored, reviewed with nothing dropped, imported, and the same Draft and file again.
    const text = await exportedText(session, version);
    assert.deepEqual(JSON.parse(text).values, CURVES);
    const reviewed = (await review(friend, text)).body.data!;
    assert.deepEqual([reviewed.values, reviewed.dropped, reviewed.droppedValues], [4, 0, []]);
    const theirs = await register(friend, 'Friend server');
    const result = await imported(friend, text);
    assert.deepEqual(await loaded(friend, theirs, result.version.id), original);
    assert.equal(await exportedText(friend, result), text);
    assert.deepEqual(encodeValues(JSON.parse(storedDraft(theirs).overrides)), encodeValues(CURVES));

    // A file's bad curve is dropped with its reason, whatever kind of bad; the rest imports.
    const bad = fileOf({ name: 'Bad curves', values: { Weapon: {
      Longsword: { Stab: { ReleaseCurve: [0, 0, 0.5, 0.5] }, AltStab: { ReleaseCurve: [0, 0, 0.205, 0.9, 1, 1] }, Strike: { ReleaseCurve: FAST_START, Windup: 0.5 }, AltStrike: { ReleaseCurve: FAST_START } },
      Rapier: { Stab: { ReleaseCurve: [0, 0, 0.5, 0.5, 0.5, 0.6, 1, 1] }, AltStab: { ReleaseCurve: FAST_START } },
    } } });
    const dropping = (await review(friend, bad)).body.data!;
    assert.deepEqual(Object.fromEntries(dropping.droppedValues.map(({ database, category, key, error }) => [`${database}/${category}/${key}`, error])), {
      'Longsword/Stab/ReleaseCurve': 'End the curve at (1,1).',
      'Longsword/AltStab/ReleaseCurve': 'Use values on the 0.01 grid; 0.205 is not.',
      'Longsword/Strike/ReleaseCurve': 'Use this key only in Stab and AltStab.',
      'Longsword/AltStrike/ReleaseCurve': 'Use this key only in Stab and AltStab.',
      'Rapier/Stab/ReleaseCurve': 'Keep times increasing; point 3 is not after point 2.',
    });
    const partial = await imported(friend, bad);
    assert.deepEqual([partial.values, partial.dropped], [2, 5]);
    assert.deepEqual(JSON.parse(versionRows().at(-1)!.overrides), { Weapon: { Longsword: { Strike: { Windup: 0.5 } }, Rapier: { AltStab: { ReleaseCurve: FAST_START } } } }, 'only what a save would accept is stored');

    // A version stored before the rules or holding the key in a strike: loading it names the refused values, and Apply cannot send them.
    const older = await saved(session, id, { name: 'Older' });
    const OLDER = { Weapon: { Longsword: { Stab: { ReleaseCurve: [0, 0, 0.5, 0.5] }, Strike: { ReleaseCurve: FAST_START } } } };
    platformStore().run('UPDATE ruleset_versions SET overrides = ? WHERE id = ?', JSON.stringify(OLDER), older.version.id);
    const opened = await loaded(session, id, older.version.id);
    assert.deepEqual(opened.document, OLDER, 'loaded as it is, to fix in the Draft');
    assert.deepEqual([opened.dropped, opened.errors], [0, [
      { database: 'Longsword', category: 'Stab', key: 'ReleaseCurve', error: 'End the curve at (1,1).' },
      { database: 'Longsword', category: 'Strike', key: 'ReleaseCurve', error: 'Use this key only in Stab and AltStab.' },
    ]]);
    const applied = applyDraft(id, { revision: storedDraft(id).revision, liveConfigurationId: null });
    assert(applied && !applied.ok && applied.reason === 'invalid', 'Apply refuses the Draft that holds them');
    break;
  }
  case 'privacy': {
    await save(session, id, DOCUMENT);
    const mine = await saved(session, id, { name: 'Competitive' });
    const second = await saved(session, id, { name: 'Second' });
    const noVersion = { status: 404, cache: 'no-store', body: { success: false, error: 'No such Ruleset version' } };
    // Another owner's Ruleset answers as a missing one does, with the right ids or not.
    assert.deepEqual(await answer(await exported(friend, mine.ruleset.id, mine.version.id)), noVersion);
    // A version of another Ruleset, a missing one, and ids that cannot be one.
    for (const [rulesetId, versionId] of [[mine.ruleset.id, second.version.id], [mine.ruleset.id, 999], [999, mine.version.id], ['abc', mine.version.id], [mine.ruleset.id, 'abc'], [0, 0]] as const) {
      assert.deepEqual(await answer(await exported(session, rulesetId, versionId)), noVersion, `${rulesetId}/${versionId}`);
    }
    // Signed out, or a write from another origin.
    const signedOut = (path: string, init?: RequestInit) => new Request(new URL(path, env.publicUrl), { ...init, headers: { 'Content-Type': 'application/json', Origin: session.origin } });
    const file = writeRulesetFile({ name: 'Forged', description: null, values: DOCUMENT });
    const params = { params: Promise.resolve({ id: String(mine.ruleset.id), versionId: String(mine.version.id) }) };
    assert.equal((await exportRoute.GET(signedOut(`/api/rulesets/${mine.ruleset.id}/versions/${mine.version.id}/export`), params)).status, 401);
    assert.equal((await importRoute.POST(signedOut('/api/rulesets/import', json('POST', { file, commit: true })))).status, 401);
    const foreign = new Request(new URL('/api/rulesets/import', env.publicUrl), { ...json('POST', { file, commit: true }), headers: { 'Content-Type': 'application/json', Cookie: session.cookie, Origin: 'https://elsewhere.test' } });
    assert.equal((await importRoute.POST(foreign)).status, 403);
    assert.equal(platformStore().all('SELECT id FROM rulesets WHERE name = ?', 'Forged').length, 0);
    // An import belongs to whoever imports it.
    const result = await imported(friend, file);
    assert.deepEqual((await list(session)).some(entry => entry.id === result.ruleset.id), false);
    assert.deepEqual(await answer(await exported(session, result.ruleset.id, result.version.id)), noVersion);
    break;
  }
  default:
    throw new Error(`Unknown scenario ${process.argv[2]}`);
}
session.close();
console.log(JSON.stringify({ fixture: 'passed' }));
