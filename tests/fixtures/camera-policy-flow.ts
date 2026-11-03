/** Real store, Draft and Ruleset routes. The editor and Apply part is
 * camera-policy-review.ts, on the feature review harness. This keeps the
 * Draft route's refusal of hand-made input, and saving and loading Ruleset
 * versions (online-platform#35).
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { signInForTest, type TestSession } from '../helpers/platform-session';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-camera-'));
process.env.DATABASE_PATH = join(root, 'platform.db');
const originalFetch = globalThis.fetch;
let session: TestSession | undefined;
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
try {
  session = await signInForTest();
  const { POST: register } = await import('../../src/app/api/game-servers/route');
  const { GET: read, PUT: save } = await import('../../src/app/api/game-servers/[id]/draft/route');
  const { POST: saveVersion } = await import('../../src/app/api/game-servers/[id]/draft/save-version/route');
  const { POST: loadVersion } = await import('../../src/app/api/game-servers/[id]/draft/load/route');
  const { readDraft } = await import('../../src/lib/platform/drafts');
  const { applyReview } = await import('../../src/lib/platform/live-configurations');
  const { platformStore } = await import('../../src/lib/platform/storage');
  const { commandBatch } = await import('../../src/lib/config/encodeValues');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  const registered = await register(session.request('/api/game-servers', json('POST', { name: 'Camera' })));
  assert.equal(registered.status, 201);
  const gameServerId: number = (await registered.json()).data.gameServer.id;
  const draftUrl = `/api/game-servers/${gameServerId}/draft`;
  const at = { params: Promise.resolve({ id: String(gameServerId) }) };
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (url === draftUrl && method === 'GET') return read(session!.request(url, init), at);
    if (url === draftUrl && method === 'PUT') return save(session!.request(url, init), at);
    if (url === `${draftUrl}/save-version` && method === 'POST') return saveVersion(session!.request(url, init), at);
    if (url === `${draftUrl}/load` && method === 'POST') return loadVersion(session!.request(url, init), at);
    assert.fail(`the fixture does not serve ${method} ${url}`);
  }) as unknown as typeof fetch;
  const store = useConfigStore.getState();
  await store.openDraft(gameServerId);
  const camera = async () => (await (await read(session!.request(draftUrl), at)).json()).data.values.character.Camera;
  /** The saved Draft's Camera, and the Camera command of the batch Apply builds from it. */
  async function assertSaved(expected: Record<string, unknown>, command: string) {
    await flushConfigWrites();
    assert.deepEqual(await camera(), expected);
    assert.deepEqual(commandBatch(readDraft(gameServerId)!.document), ['string ezconfig WipeDatabases', command]);
  }

  store.setValue('Character', 'Camera', 'CustomFOVMax', 179); store.setValue('Character', 'Camera', 'CustomFOV', false);
  await assertSaved({ CustomFOVMax: 179, CustomFOV: false }, 'string ezconfig Character Camera {"CustomFOVMax":"179","CustomFOV":"False"}');
  // A hand-made save the policy refuses saves nothing, valid fields included; a null is no Reset in a whole document.
  const { revision } = readDraft(gameServerId)!;
  for (const entries of [{ CustomFOVMax: 120.0000001 }, { CustomFOVMax: 179.0000001 }, { CustomFOVMax: 100.9999999 }, { CustomFOVMax: 1.201e2 }, { CustomFOVMax: '120' }, { CustomFOVMax: null }, { CustomFOV: 'garbage' }, { CustomFOV: 1 }, { CustomFOV: 'True' }]) {
    const refused = await save(session.request(draftUrl, json('PUT', { revision, document: { Character: { CustomFOV: true, CustomFOVMax: 135, ...entries } } })), at);
    assert.equal(refused.status, 400, JSON.stringify(entries));
  }
  assert.equal(readDraft(gameServerId)!.revision, revision);
  assert.deepEqual(await camera(), { CustomFOVMax: 179, CustomFOV: false });

  // Saving the Draft as a Ruleset version, and loading it back over a changed Draft.
  const { ruleset, version } = await store.saveRulesetVersion({ name: 'Camera' }, 'Fixture');
  assert.equal(version.number, 1);
  assert.equal(readDraft(gameServerId)!.originId, version.id, 'the saved version is the origin');
  store.setValue('Character', 'Camera', 'CustomFOVMax', 150);
  await assertSaved({ CustomFOVMax: 150, CustomFOV: false }, 'string ezconfig Character Camera {"CustomFOVMax":"150","CustomFOV":"False"}');
  assert.deepEqual(await store.loadRulesetVersion(version.id), { dropped: 0, errors: [] });
  await assertSaved({ CustomFOVMax: 179, CustomFOV: false }, 'string ezconfig Character Camera {"CustomFOVMax":"179","CustomFOV":"False"}');
  // A version holding values the camera policy refuses (as one saved under an older schema would) loads, names
  // them, and blocks Apply; the next save is refused until they are fixed.
  const storedVersion = (overrides: string) => platformStore().get<{ id: number }>(
    "INSERT INTO ruleset_versions (ruleset_id, number, description, overrides, saved_at) VALUES (?, (SELECT MAX(number) + 1 FROM ruleset_versions WHERE ruleset_id = ?), NULL, ?, 0) RETURNING id",
    ruleset.id, ruleset.id, overrides,
  )!.id;
  for (const value of [120.5, '120']) {
    const loaded = await store.loadRulesetVersion(storedVersion(JSON.stringify({ Character: { CustomFOV: true, CustomFOVMax: value } })));
    assert.deepEqual(loaded.errors.map(error => [error.category, error.key]), [['Camera', 'CustomFOVMax']], JSON.stringify(value));
    assert.deepEqual(await camera(), { CustomFOV: true, CustomFOVMax: value });
    assert.deepEqual(applyReview(gameServerId)!.errors.map(error => error.key), ['CustomFOVMax'], 'Apply blocks on the refused value');
    store.setValue('Character', 'Camera', 'CustomFOV', false);
    await assert.rejects(flushConfigWrites(), /Not saved: CustomFOVMax/);
  }
  store.setValue('Character', 'Camera', 'CustomFOVMax', 135);
  await assertSaved({ CustomFOV: false, CustomFOVMax: 135 }, 'string ezconfig Character Camera {"CustomFOV":"False","CustomFOVMax":"135"}');
  assert.deepEqual(await store.loadRulesetVersion(storedVersion('{"Character":{"CustomFOV":true,"CustomFOVMax":1.2e2}}')), { dropped: 0, errors: [] });
  await assertSaved({ CustomFOV: true, CustomFOVMax: 120 }, 'string ezconfig Character Camera {"CustomFOV":"True","CustomFOVMax":"120"}');
  console.log('PASS Camera policy: refused hand-made input and Ruleset versions.');
} finally {
  globalThis.fetch = originalFetch; session?.close();
  const target = resolve(root); assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)!.startsWith('ezconfig-camera-'));
  await rm(target, { recursive: true, force: true });
}
