/** Real store, Draft and preset routes, startup and RCON sender against a local TCP fixture.
 * The fixture acknowledges known-good cases; native parser/camera proof is
 * intentionally separate and uses the retained command capture.
 * The editor and Apply part is camera-policy-review.ts, on the feature review
 * harness. This keeps the Draft route's refusal of hand-made input, presets
 * (until Rulesets replaces them) and automatic startup sync, which delivers
 * the self-hosted files until online-platform#41.
 */
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import JSZip from 'jszip';
import { signInForTest, type TestSession } from '../helpers/platform-session';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-camera-'));
process.env.DATABASES_PATH = join(root, 'Databases');
process.env.PRESETS_PATH = join(root, 'Presets');
process.env.DATABASE_PATH = join(root, 'platform.db');
process.env.RCON_HOST = '127.0.0.1'; process.env.RCON_PASSWORD = 'local-fixture-only';
const sockets = new Set<Socket>();
const captures: { name: string; commands: string[]; wire: string[] }[] = [];
let name = 'setup', token = 0;
function packet(id: number, type: number, payload: string) {
  const content = Buffer.from(payload); const output = Buffer.alloc(content.length + 14);
  output.writeInt32LE(content.length + 10, 0); output.writeInt32LE(id, 4); output.writeInt32LE(type, 8); content.copy(output, 12); return output;
}
const server = createServer(socket => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  let data = Buffer.alloc(0), processed = 0, totalAccepted = 0, cleared = false, batchToken = '';
  let capture: typeof captures[number] | undefined;
  socket.on('data', chunk => {
    data = Buffer.concat([data, chunk]);
    while (data.length >= 4 && data.length >= data.readInt32LE(0) + 4) {
      const length = data.readInt32LE(0), body = data.subarray(4, length + 4); data = data.subarray(length + 4);
      const id = body.readInt32LE(0), type = body.readInt32LE(4), text = body.subarray(8, -2).toString();
      if (type === 3) { socket.write(packet(id, 2, '')); continue; }
      socket.write(packet(id, 0, text === 'listen custom' ? 'Now listening to custom' : ''));
      if (!text.startsWith('string ezconfig batch ')) continue;
      const frame = JSON.parse(text.slice('string ezconfig batch '.length));
      let accepted = 0;
      if (frame.op === 'begin') {
        capture = { name, commands: [], wire: [] }; captures.push(capture);
        batchToken = `camera-fixture-${++token}`; processed = 0; totalAccepted = 0; cleared = false;
      } else if (frame.op === 'command') {
        capture!.commands.push('string ' + frame.command); processed++;
        const wipe = frame.command === 'ezconfig WipeDatabases'; cleared ||= wipe;
        accepted = wipe ? 0 : Object.keys(JSON.parse(frame.command.slice(frame.command.indexOf('{')))).length;
        totalAccepted += accepted;
      }
      capture!.wire.push(text);
      socket.write(packet(-1, 0, 'Custom: EZCONFIG_BATCH_RESULT ' + JSON.stringify({
        protocol: 'EZConfigBatch/1', request: frame.request, op: frame.op, token: batchToken,
        seq: Number(frame.seq ?? 0), success: true, accepted, ignored: 0, totalAccepted, totalIgnored: 0,
        processed, cleared, state: frame.op === 'end' ? 'complete' : 'active', reason: '',
        ...(frame.op === 'begin' ? { maxCommands: 2048, idleTimeoutSeconds: 30 } : {}),
      })));
    }
  });
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
process.env.RCON_PORT = String((server.address() as { port: number }).port);
const originalFetch = globalThis.fetch;
let stopSync: (() => Promise<void>) | undefined;
let session: TestSession | undefined;
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function until(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check()) { assert(Date.now() < end, 'Fixture did not settle'); await Bun.sleep(5); }
}
try {
  session = await signInForTest();
  const { POST: register } = await import('../../src/app/api/game-servers/route');
  const { GET: read, PUT: save } = await import('../../src/app/api/game-servers/[id]/draft/route');
  const { POST: savePreset } = await import('../../src/app/api/presets/user/route');
  const { POST: importPreset } = await import('../../src/app/api/presets/import/route');
  const { loadUserPresetData } = await import('../../src/lib/presets/service');
  const { readDraft } = await import('../../src/lib/platform/drafts');
  const { commandBatch } = await import('../../src/lib/config/encodeValues');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  const registered = await register(session.request('/api/game-servers', json('POST', { name: 'Camera' })));
  assert.equal(registered.status, 201);
  const gameServerId: number = (await registered.json()).data.gameServer.id;
  const draftUrl = `/api/game-servers/${gameServerId}/draft`;
  const at = { params: Promise.resolve({ id: String(gameServerId) }) };
  let writes = 0;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (url === draftUrl && method === 'GET') return read(session!.request(url, init), at);
    writes++;
    if (url === draftUrl && method === 'PUT') return save(session!.request(url, init), at);
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

  assert.equal((await savePreset(session.request('/api/presets/user', json('POST', { name: 'camera', title: 'Camera', description: 'Fixture', gameServerId })) as never)).status, 200);
  const preset = await loadUserPresetData('camera'); assert.deepEqual(preset.character.Camera, { CustomFOVMax: 179, CustomFOV: false });
  const writesBeforePreset = writes;
  await assert.rejects(store.loadPreset({ character: { Camera: { CustomFOV: true, CustomFOVMax: 120.5 } }, weapons: {} }), /whole/);
  assert.equal(writes, writesBeforePreset, 'Invalid preset must fail before the Draft is replaced');
  await store.loadPreset(preset);
  await assertSaved({ CustomFOVMax: 179, CustomFOV: false }, 'string ezconfig Character Camera {"CustomFOVMax":"179","CustomFOV":"False"}');
  for (const value of [120.5, '120']) {
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify({ title: 'Bad camera', description: '' })); zip.file('Character/Camera.json', JSON.stringify({ CustomFOV: true, CustomFOVMax: value }));
    const form = new FormData(); form.append('name', 'invalid-camera'); form.append('file', new File([await zip.generateAsync({ type: 'arraybuffer' })], 'camera.zip'));
    assert.equal((await importPreset(session!.request('/api/presets/import', { method: 'POST', body: form }) as never)).status, 400);
    await assert.rejects(stat(join(process.env.PRESETS_PATH!, 'User', 'invalid-camera')));
  }
  const validZip = new JSZip();
  validZip.file('manifest.json', JSON.stringify({ title: 'Imported camera', description: '' }));
  validZip.file('Character/Camera.json', '{"CustomFOV":true,"CustomFOVMax":1.2e2}');
  const validForm = new FormData(); validForm.append('name', 'imported-camera');
  validForm.append('file', new File([await validZip.generateAsync({ type: 'arraybuffer' })], 'camera.zip'));
  assert.equal((await importPreset(session!.request('/api/presets/import', { method: 'POST', body: validForm }) as never)).status, 200);
  await store.loadPreset(await loadUserPresetData('imported-camera'));
  await assertSaved({ CustomFOV: true, CustomFOVMax: 120 }, 'string ezconfig Character Camera {"CustomFOV":"True","CustomFOVMax":"120"}');

  // Automatic sync delivers the self-hosted files, which the Draft does not write.
  const { patchCategory } = await import('../../src/lib/database/service');
  await patchCategory('Character', 'Camera', { CustomFOV: true, CustomFOVMax: 135 });
  const { registerServerStartup } = await import('../../src/lib/server-startup');
  const { stopRegisteredAutomaticSync } = await import('../../src/lib/rcon/automatic-sync-bootstrap'); stopSync = stopRegisteredAutomaticSync;
  const lease = createServer(); await new Promise<void>(done => lease.listen(0, '127.0.0.1', done));
  const leasePort = (lease.address() as { port: number }).port; await new Promise<void>(done => lease.close(() => done()));
  name = 'automatic-startup'; const count = captures.length;
  await registerServerStartup({ ...process.env, NEXT_RUNTIME: 'nodejs', RCON_AUTO_SYNC_ENABLED: 'true', RCON_AUTO_SYNC_OWNER_PORT: String(leasePort) });
  await until(() => captures.length > count && captures.at(-1)!.wire.at(-1)?.includes('"op":"end"') === true);
  assert.deepEqual(captures.at(-1)!.commands, ['string ezconfig WipeDatabases', 'string ezconfig Character Camera {"CustomFOV":"True","CustomFOVMax":"135"}']);
  name = 'automatic-requestupdate'; const count2 = captures.length;
  for (const socket of sockets) socket.write(packet(-1, 0, 'Custom: ezconfig requestupdate'));
  await until(() => captures.length > count2 && captures.at(-1)!.wire.at(-1)?.includes('"op":"end"') === true);
  assert.deepEqual(captures.at(-1)!.commands, captures[count].commands);
  await stopSync(); stopSync = undefined;

  // Automatic sync's strict build refuses damaged storage and leaves it as it was; Apply's refusal is in camera-policy-review.
  const cameraPath = join(process.env.DATABASES_PATH!, 'Character', 'Camera.json');
  const { buildRconCommands } = await import('../../src/lib/database/apply');
  for (const damaged of [{ CustomFOV: true, CustomFOVMax: 120.5 }, { CustomFOV: 'garbage', CustomFOVMax: 120 }]) {
    await writeFile(cameraPath, JSON.stringify(damaged));
    await assert.rejects(buildRconCommands({ strictStorage: true }), /Invalid saved configuration/);
    assert.deepEqual(JSON.parse(await readFile(cameraPath, 'utf8')), damaged);
  }
  if (process.env.EZ_CAMERA_CAPTURE_PATH) await writeFile(process.env.EZ_CAMERA_CAPTURE_PATH, JSON.stringify({
    boundary: 'Actual startup and sync listener with the acknowledged RCON sender over local TCP, delivering the self-hosted files. Server replies are controlled fixture acknowledgments; no native parser/camera claim.', captures,
  }, null, 2));
  console.log(`PASS Camera policy: ${captures.length} real TCP RCON batches; refused hand-made input, preset safety, startup/requestupdate and strict storage.`);
} finally {
  globalThis.fetch = originalFetch; await stopSync?.(); session?.close();
  for (const socket of sockets) socket.destroy();
  await new Promise<void>(done => server.close(() => done()));
  const target = resolve(root); assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)!.startsWith('ezconfig-camera-'));
  await rm(target, { recursive: true, force: true });
}
