/** Real store/routes/presets/startup/RCON sender against a local TCP fixture.
 * The fixture acknowledges known-good cases; native parser/camera proof is
 * intentionally separate and uses the retained command capture.
 * The editor and Apply part is camera-policy-review.ts, on the feature review
 * harness. This keeps the routes' refusal of hand-made input, presets (until
 * Rulesets replaces them) and automatic startup sync.
 */
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import JSZip from 'jszip';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-camera-'));
process.env.DATABASES_PATH = join(root, 'Databases');
process.env.PRESETS_PATH = join(root, 'Presets');
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
const request = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ path: ['Character', 'Camera'] }) };
async function until(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check()) { assert(Date.now() < end, 'Fixture did not settle'); await Bun.sleep(5); }
}
try {
  const { POST: save, GET: read } = await import('../../src/app/api/config/[...path]/route');
  const { DELETE: clear } = await import('../../src/app/api/config/clear/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { POST: savePreset } = await import('../../src/app/api/presets/user/route');
  const { POST: importPreset } = await import('../../src/app/api/presets/import/route');
  const { loadUserPresetData } = await import('../../src/lib/presets/service');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  let writes = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    writes++;
    if (url === '/api/config/clear') return clear();
    return save(new Request('http://localhost' + url, init) as never, { params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }) });
  }) as unknown as typeof fetch;
  const store = useConfigStore.getState();
  async function applySaved(stage: string, expected: Record<string, unknown>) {
    name = stage; await flushConfigWrites();
    const saved = await read(request({}) as never, params); assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).data, expected);
    const response = await preview(); assert.equal(response.status, 200);
    const { commands } = await response.json();
    const result = await apply(request({})); assert.equal(result.status, 200);
    assert.equal((await result.json()).success, true);
    assert.deepEqual(captures.at(-1)!.commands, ['string ezconfig WipeDatabases', ...commands]);
  }

  store.setValue('Character', 'Camera', 'CustomFOVMax', 179); store.setValue('Character', 'Camera', 'CustomFOV', false);
  await flushConfigWrites();
  // A whole-category write refuses a null maximum, which the editor's per-key saves treat as Reset.
  assert.equal((await save(request({ entries: { CustomFOV: true, CustomFOVMax: null } }) as never, params)).status, 400);
  assert.deepEqual((await (await read(request({}) as never, params)).json()).data, { CustomFOVMax: 179, CustomFOV: false });
  for (const raw of ['120.0000001', '120.00000000000000000000001', '179.0000001', '100.9999999', '1.201e2', 'Infinity', ' 120', '120 ', '\t120', '120\n']) {
    const count = captures.length;
    const invalid = await apply(request({ commands: [`string ezconfig Character Camera ${JSON.stringify({ CustomFOV: 'False', CustomFOVMax: raw })}`], wipeDatabase: true }));
    assert.equal(invalid.status, 400); assert.equal(captures.length, count, 'Invalid raw maximum must not admit a wipe');
  }
  const beforeMultiline = captures.length;
  assert.equal((await apply(request({ commands: ['string ezconfig Character Camera {\n"customfovmax":"120.0000001"\n}'] }))).status, 400);
  assert.equal(captures.length, beforeMultiline);
  for (const value of ['garbage', true, 1]) {
    const count = captures.length;
    assert.equal((await apply(request({ commands: [`string ezconfig Character Camera ${JSON.stringify({ CustomFOV: value })}`] }))).status, 400);
    assert.equal(captures.length, count);
  }
  for (const raw of ['120.0', '1.2e2', '12000e-2', '.12e3', '+00120.000e+000']) {
    name = 'semantic-integer-' + raw;
    const command = `string ezconfig Character Camera ${JSON.stringify({ CustomFOVMax: raw })}`;
    assert.equal((await apply(request({ commands: [command], wipeDatabase: false }))).status, 200);
    assert.deepEqual(captures.at(-1)!.commands, [command]);
  }

  assert.equal((await savePreset(request({ name: 'camera', title: 'Camera', description: 'Fixture' }) as never)).status, 200);
  const preset = await loadUserPresetData('camera'); assert.deepEqual(preset.character.Camera, { CustomFOVMax: 179, CustomFOV: false });
  const writesBeforePreset = writes;
  await assert.rejects(store.loadPreset({ character: { Camera: { CustomFOV: true, CustomFOVMax: 120.5 } }, weapons: {} }), /whole/);
  assert.equal(writes, writesBeforePreset, 'Invalid preset must fail before clear');
  await store.loadPreset(preset);
  await applySaved('preset-roundtrip', { CustomFOVMax: 179, CustomFOV: false });
  for (const value of [120.5, '120']) {
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify({ title: 'Bad camera', description: '' })); zip.file('Character/Camera.json', JSON.stringify({ CustomFOV: true, CustomFOVMax: value }));
    const form = new FormData(); form.append('name', 'invalid-camera'); form.append('file', new File([await zip.generateAsync({ type: 'arraybuffer' })], 'camera.zip'));
    assert.equal((await importPreset(new Request('http://localhost/api/presets/import', { method: 'POST', body: form }) as never)).status, 400);
    await assert.rejects(stat(join(process.env.PRESETS_PATH!, 'User', 'invalid-camera')));
  }
  const validZip = new JSZip();
  validZip.file('manifest.json', JSON.stringify({ title: 'Imported camera', description: '' }));
  validZip.file('Character/Camera.json', '{"CustomFOV":true,"CustomFOVMax":1.2e2}');
  const validForm = new FormData(); validForm.append('name', 'imported-camera');
  validForm.append('file', new File([await validZip.generateAsync({ type: 'arraybuffer' })], 'camera.zip'));
  assert.equal((await importPreset(new Request('http://localhost/api/presets/import', { method: 'POST', body: validForm }) as never)).status, 200);
  await store.loadPreset(await loadUserPresetData('imported-camera'));
  await applySaved('imported-preset-semantic-integer', { CustomFOV: true, CustomFOVMax: 120 });

  store.setValue('Character', 'Camera', 'CustomFOV', true); store.setValue('Character', 'Camera', 'CustomFOVMax', 135); await flushConfigWrites();
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
    boundary: 'Actual store, API routes, presets, acknowledged RCON sender, startup and sync listener over local TCP. Server replies are controlled fixture acknowledgments; no native parser/camera claim.', captures,
  }, null, 2));
  console.log(`PASS Camera policy: ${captures.length} real TCP RCON batches; refused hand-made input, preset safety, startup/requestupdate and strict storage.`);
} finally {
  globalThis.fetch = originalFetch; await stopSync?.();
  for (const socket of sockets) socket.destroy();
  await new Promise<void>(done => server.close(() => done()));
  const target = resolve(root); assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)!.startsWith('ezconfig-camera-'));
  await rm(target, { recursive: true, force: true });
}
