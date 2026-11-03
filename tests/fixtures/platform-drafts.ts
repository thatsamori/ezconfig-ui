/**
 * A game server's Draft through the route handlers: load and save, validation
 * errors, stale revisions, two writers on one revision, Reset to game
 * defaults, values the schema has no place for, and pins. One scenario per run (argv[2]), each in its own process
 * with the env set by tests/platform-drafts.test.ts. Asserts as it goes.
 */
import assert from 'node:assert/strict';
import { signInForTest, type TestSession } from '../helpers/platform-session';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const { commandBatch } = await import('../../src/lib/config/encodeValues');
const { valuesDocument } = await import('../../src/lib/config/valuesDocument');
const { lookupDefault } = await import('../../src/lib/config/defaults');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const draftRoute = await import('../../src/app/api/game-servers/[id]/draft/route');
const resetRoute = await import('../../src/app/api/game-servers/[id]/draft/reset/route');

type View = { values: { character: Record<string, Record<string, unknown>>; weapons: Record<string, Record<string, Record<string, unknown>>> }; dropped: number; revision: number; savedAt: number | null };
type Body = { success: boolean; error?: string; details?: { database: string; category?: string; key: string; error: string }[]; data?: View & { revision: number } };

const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const at = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const url = (id: number | string) => `/api/game-servers/${id}/draft`;
const answer = async (response: Response) => ({ status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Body });

async function register(session: TestSession, name: string): Promise<number> {
  const response = await gameServersRoute.POST(session.request('/api/game-servers', json('POST', { name })));
  assert.equal(response.status, 201);
  return (await response.json()).data.gameServer.id;
}
const load = async (session: TestSession, id: number | string) => answer(await draftRoute.GET(session.request(url(id)), at(id)));
const save = async (session: TestSession, id: number | string, revision: unknown, document: unknown) => answer(await draftRoute.PUT(session.request(url(id), json('PUT', { revision, document })), at(id)));
const saveBody = async (session: TestSession, id: number, body: string) => answer(await draftRoute.PUT(session.request(url(id), json('PUT', body)), at(id)));
const reset = async (session: TestSession, id: number | string, revision: unknown) => answer(await resetRoute.POST(session.request(`${url(id)}/reset`, json('POST', { revision })), at(id)));
/** The drafts row as stored. */
const stored = (id: number) => platformStore().get<{ overrides: string; revision: number; saved_at: number | null }>('SELECT overrides, revision, saved_at FROM drafts WHERE game_server_id = ?', id)!;
const loaded = async (session: TestSession, id: number) => {
  const { status, cache, body } = await load(session, id);
  assert.equal(status, 200);
  assert.equal(cache, 'no-store');
  return body.data!;
};

const session = await signInForTest();
const id = await register(session, 'Duel EU');

switch (process.argv[2]) {
  case 'load-and-save': {
    assert.deepEqual(await loaded(session, id), { values: { character: {}, weapons: {} }, dropped: 0, revision: 0, savedAt: null, origin: null }, 'a new Draft is empty');
    const document = {
      Character: { MaxWalkSpeed: 450, CanDodge: false, ForwardParryLength: 50 },
      Weapon: { ArmingSword: { ParryTurnCap: { x: 375, y: 262.5 }, Strike: { Windup: 0.5 }, AltStab: { Windup: 0.45, Damage: [50, 45, 40] } } },
    };
    const before = Date.now();
    const saved = await save(session, id, 0, document);
    assert.equal(saved.status, 200);
    assert.equal(saved.cache, 'no-store');
    assert.equal(saved.body.data!.revision, 1, 'a save raises the revision');
    assert(saved.body.data!.savedAt! >= before);
    assert.deepEqual({ ...stored(id) }, { overrides: JSON.stringify(document), revision: 1, saved_at: saved.body.data!.savedAt }, 'the document is stored as sent, keyed by database, weapon class and key name');
    assert.deepEqual(await loaded(session, id), {
      values: {
        character: { Movement: { MaxWalkSpeed: 450, CanDodge: false }, Parry: { ForwardParryLength: 50 } },
        weapons: { ArmingSword: { General: { ParryTurnCap: { x: 375, y: 262.5 } }, Strike: { Windup: 0.5 }, AltStab: { Windup: 0.45, Damage: [50, 45, 40] } } },
      },
      dropped: 0, revision: 1, savedAt: saved.body.data!.savedAt, origin: null,
    }, 'loading places each value under its key\'s current category');
    // A reset key is not in the next whole document.
    const next = await save(session, id, 1, { Character: { CanDodge: false }, Weapon: { ArmingSword: { Strike: { Windup: 0.55 } } } });
    assert.equal(next.body.data!.revision, 2);
    assert.deepEqual((await loaded(session, id)).values, { character: { Movement: { CanDodge: false } }, weapons: { ArmingSword: { Strike: { Windup: 0.55 } } } });
    assert.deepEqual(commandBatch(JSON.parse(stored(id).overrides)), [
      'string ezconfig WipeDatabases',
      'string ezconfig Character Movement {"CanDodge":"False"}',
      'string ezconfig ArmingSword Strike {"Windup":"0.55"}',
    ]);
    // An emptied Draft saves as an empty document.
    assert.equal((await save(session, id, 2, {})).body.data!.revision, 3);
    assert.equal(stored(id).overrides, '{}');
    break;
  }
  case 'validation': {
    const refused = async (document: unknown, details: Body['details']) => {
      const { status, cache, body } = await save(session, id, 0, document);
      assert.equal(status, 400, JSON.stringify(document));
      assert.equal(cache, 'no-store');
      assert.deepEqual(body, { success: false, error: 'Validation failed', details }, JSON.stringify(document));
      assert.deepEqual({ ...stored(id) }, { overrides: '{}', revision: 0, saved_at: null }, 'a refused save writes nothing');
    };
    // The camera policy: a whole maximum from 101 to 179, and a boolean toggle.
    await refused({ Character: { CustomFOV: true, CustomFOVMax: 120.5 } }, [{ database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: 'Use a whole number.' }]);
    for (const value of [100, 180]) await refused({ Character: { CustomFOVMax: value } }, [{ database: 'Character', category: 'Camera', key: 'CustomFOVMax', error: 'Use a finite value from 101 to 179.' }]);
    await refused({ Character: { CustomFOV: 'garbage' } }, [{ database: 'Character', category: 'Camera', key: 'CustomFOV', error: 'Expected Boolean, got String' }]);
    // Every value is checked, whatever its type; one refused value refuses the save, valid ones included.
    await refused({ Character: { MaxWalkSpeed: 450, CanDodge: 1 }, Weapon: { ArmingSword: { Strike: { Windup: '0.5' } } } }, [
      { database: 'Character', category: 'Movement', key: 'CanDodge', error: 'Expected Boolean, got Float' },
      { database: 'ArmingSword', category: 'Strike', key: 'Windup', error: 'Expected Float, got String' },
    ]);
    await refused({ Character: { OutOfStaminaStunDuration: -1 } }, [{ database: 'Character', category: 'Stun', key: 'OutOfStaminaStunDuration', error: 'Use a finite value of 0 or more.' }]);
    // A key or weapon class the schema lacks is refused too: only a value already stored is kept.
    await refused({ Character: { RetiredKey: 1 }, Weapon: { Claymore: { Windup: 0.5 }, ArmingSword: { Strike: { RetiredAttackKey: 1 } } } }, [
      { database: 'Character', key: 'RetiredKey', error: 'Unknown config key' },
      { database: 'Claymore', key: 'Windup', error: 'Unknown weapon class' },
      { database: 'ArmingSword', key: 'RetiredAttackKey', error: 'Unknown config key' },
    ]);
    // Not a document, or no revision: refused before any value is read.
    const shape = 'Send the whole Draft document with the revision it was based on';
    for (const body of [{ revision: 0, document: [] }, { revision: 0, document: { Settings: {} } }, { revision: 0, document: { Weapon: { ArmingSword: 1 } } }, { document: {} }, { revision: -1, document: {} }, { revision: 1.5, document: {} }]) {
      assert.deepEqual(await save(session, id, body.revision, body.document), { status: 400, cache: 'no-store', body: { success: false, error: shape } }, JSON.stringify(body));
    }
    assert.deepEqual(await saveBody(session, id, '{"revision": 0, "document": {'), { status: 400, cache: 'no-store', body: { success: false, error: shape } });
    assert.deepEqual(await saveBody(session, id, JSON.stringify({ revision: 0, document: { Character: { Padding: 'x'.repeat(2 * 1024 * 1024) } } })), { status: 413, cache: 'no-store', body: { success: false, error: 'The Draft is too large to save' } });
    assert.equal(stored(id).revision, 0);
    assert.equal((await save(session, id, 0, { Character: { CustomFOV: true, CustomFOVMax: 120 } })).status, 200, 'the valid document saves');
    break;
  }
  case 'stale': {
    const first = { Character: { MaxWalkSpeed: 450 } };
    assert.equal((await save(session, id, 0, first)).status, 200);
    const view = await loaded(session, id);
    // Another tab's save on the same revision, or a revision the Draft never had.
    for (const revision of [0, 5]) {
      const { status, cache, body } = await save(session, id, revision, { Character: { MaxWalkSpeed: 600 } });
      assert.deepEqual({ status, cache, body }, { status: 409, cache: 'no-store', body: { success: false, error: 'The Draft changed since this page loaded it', data: view } }, 'refused with the current Draft');
    }
    assert.deepEqual({ revision: stored(id).revision, overrides: stored(id).overrides }, { revision: 1, overrides: JSON.stringify(first) });
    const refused = await reset(session, id, 0);
    assert.deepEqual(refused, { status: 409, cache: 'no-store', body: { success: false, error: 'The Draft changed since this page loaded it', data: view } });
    assert.equal(stored(id).overrides, JSON.stringify(first), 'a stale reset resets nothing');
    break;
  }
  case 'two-writers': {
    // Two tabs write on the same revision at once: exactly one is written, and the other is refused with the Draft the first left.
    const race = async (writes: (() => Promise<Awaited<ReturnType<typeof answer>>>)[]) => {
      const revision = stored(id).revision;
      const answers = await Promise.all(writes.map(write => write()));
      assert.deepEqual(answers.map(({ status }) => status).sort(), [200, 409], 'exactly one write succeeds');
      assert.equal(stored(id).revision, revision + 1, 'the Draft moved on once');
      const current = await loaded(session, id);
      const refused = answers.find(({ status }) => status === 409)!;
      assert.deepEqual(refused, { status: 409, cache: 'no-store', body: { success: false, error: 'The Draft changed since this page loaded it', data: current } }, 'the refusal carries the current Draft');
      return answers.findIndex(({ status }) => status === 200);
    };
    const tabs = [{ Character: { MaxWalkSpeed: 450 } }, { Weapon: { ArmingSword: { Strike: { Windup: 0.5 } } } }];
    const winner = await race(tabs.map(document => () => save(session, id, 0, document)));
    assert.equal(stored(id).overrides, JSON.stringify(tabs[winner]), "the refused save's document is not stored");
    // A save and Reset to game defaults on the same revision.
    const next = await race([() => save(session, id, 1, { Character: { MaxWalkSpeed: 600 } }), () => reset(session, id, 1)]);
    assert.equal(stored(id).overrides, next === 0 ? JSON.stringify({ Character: { MaxWalkSpeed: 600 } }) : '{}');
    break;
  }
  case 'reset': {
    assert.equal((await save(session, id, 0, { Character: { MaxWalkSpeed: 450 }, Weapon: { ArmingSword: { Strike: { Windup: 0.5 } } } })).status, 200);
    const done = await reset(session, id, 1);
    assert.equal(done.status, 200);
    assert.equal(done.cache, 'no-store');
    assert.deepEqual({ ...done.body.data!, savedAt: undefined }, { values: { character: {}, weapons: {} }, dropped: 0, revision: 2, savedAt: undefined, origin: null });
    assert.deepEqual({ overrides: stored(id).overrides, revision: stored(id).revision }, { overrides: '{}', revision: 2 }, 'Reset to game defaults empties the Draft and raises the revision');
    assert.deepEqual(commandBatch(JSON.parse(stored(id).overrides)), ['string ezconfig WipeDatabases']);
    for (const revision of [undefined, 'two']) assert.deepEqual(await reset(session, id, revision), { status: 400, cache: 'no-store', body: { success: false, error: 'Send the revision the reset is based on' } });
    break;
  }
  case 'dropped-on-load': {
    // An older schema's document: retired keys and a retired weapon class beside current values.
    const document = {
      Character: { MaxWalkSpeed: 450, RetiredKey: 1, ForwardParryLength: 50 },
      Weapon: { ArmingSword: { RetiredGeneralKey: true, Strike: { Windup: 0.5, RetiredAttackKey: 2 } }, Claymore: { ParryTurnCap: { x: 1, y: 2 }, Strike: { Windup: 0.4 } } },
    };
    const text = JSON.stringify(document);
    platformStore().run('UPDATE drafts SET overrides = ? WHERE game_server_id = ?', text, id);
    const view = await loaded(session, id);
    assert.deepEqual(view.values, { character: { Movement: { MaxWalkSpeed: 450 }, Parry: { ForwardParryLength: 50 } }, weapons: { ArmingSword: { Strike: { Windup: 0.5 } } } }, 'only values the schema has a place for are shown');
    assert.equal(view.dropped, 5, 'the dropped values are counted');
    assert.equal(stored(id).overrides, text, 'loading never rewrites the stored document');
    assert.deepEqual(commandBatch(document), [
      'string ezconfig WipeDatabases',
      'string ezconfig Character Movement {"MaxWalkSpeed":"450.00"}',
      'string ezconfig Character Parry {"ForwardParryLength":"50"}',
      'string ezconfig ArmingSword Strike {"Windup":"0.50"}',
    ], 'nor are they sent');
    // The editor saves what it shows, with an edit: the values it does not show are kept as stored.
    const edited = valuesDocument({ ...view.values, character: { ...view.values.character, Movement: { MaxWalkSpeed: 500 } } });
    assert.equal((await save(session, id, 0, edited)).status, 200);
    assert.deepEqual(JSON.parse(stored(id).overrides), {
      Character: { MaxWalkSpeed: 500, ForwardParryLength: 50, RetiredKey: 1 },
      Weapon: { ArmingSword: { Strike: { Windup: 0.5, RetiredAttackKey: 2 }, RetiredGeneralKey: true }, Claymore: { ParryTurnCap: { x: 1, y: 2 }, Strike: { Windup: 0.4 } } },
    });
    assert.equal((await loaded(session, id)).dropped, 5);
    break;
  }
  case 'pins': {
    // A value set equal to its game default stays in the Draft, and is sent.
    const walk = lookupDefault('Character', 'Movement', 'MaxWalkSpeed').defaultValue as number;
    const windup = lookupDefault('ArmingSword', 'Strike', 'Windup').defaultValue as number;
    assert.equal(typeof walk, 'number');
    assert.equal(typeof windup, 'number');
    const pinned = { Character: { MaxWalkSpeed: walk }, Weapon: { ArmingSword: { Strike: { Windup: windup } } } };
    assert.equal((await save(session, id, 0, pinned)).status, 200);
    assert.equal(stored(id).overrides, JSON.stringify(pinned));
    assert.deepEqual((await loaded(session, id)).values, { character: { Movement: { MaxWalkSpeed: walk } }, weapons: { ArmingSword: { Strike: { Windup: windup } } } });
    assert.equal(commandBatch(pinned).length, 3, 'both pins are sent');
    // Reset removes the key.
    assert.equal((await save(session, id, 1, { Weapon: pinned.Weapon })).status, 200);
    assert.equal(stored(id).overrides, JSON.stringify({ Weapon: pinned.Weapon }));
    break;
  }
  case 'ownership': {
    const other = await signInForTest('Other owner');
    const theirs = await register(other, 'Duel EU');
    assert.equal((await save(other, theirs, 0, { Character: { MaxWalkSpeed: 600 } })).status, 200);
    const missing = { status: 404, cache: 'no-store', body: { success: false, error: 'No such game server' } };
    // Another owner's Draft reads as missing, whoever asks for it, as does an id that is not one.
    for (const target of [theirs, 999, '0', 'abc', '1e3']) {
      assert.deepEqual(await load(session, target), missing, `GET ${target}`);
      assert.deepEqual(await save(session, target, 0, {}), missing, `PUT ${target}`);
      assert.deepEqual(await reset(session, target, 1), missing, `reset ${target}`);
    }
    assert.equal(stored(theirs).overrides, JSON.stringify({ Character: { MaxWalkSpeed: 600 } }));
    // Signed out, or a write from another origin.
    const signedOut = (init?: RequestInit) => new Request(new URL(url(id), env.publicUrl), init);
    assert.equal((await draftRoute.GET(signedOut(), at(id))).status, 401);
    const foreign = new Request(new URL(url(id), env.publicUrl), { ...json('PUT', { revision: 0, document: {} }), headers: { 'Content-Type': 'application/json', Cookie: session.cookie, Origin: 'https://elsewhere.test' } });
    assert.equal((await draftRoute.PUT(foreign, at(id))).status, 403);
    assert.equal(stored(id).revision, 0);
    break;
  }
  default:
    throw new Error(`Unknown scenario ${process.argv[2]}`);
}
session.close();
console.log(JSON.stringify({ fixture: 'passed' }));
