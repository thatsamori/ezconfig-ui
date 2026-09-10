import { successfulProcessingFixture } from './acknowledged-transport';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-stun-duration-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = []; const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({ executeAcknowledgedBatch: async (commands: string[]) => { sent.push([...commands]); return successfulProcessingFixture(commands); } }));
try {
  const { POST: save, GET: read } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  let writes = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    writes++;
    return save(new Request('http://localhost' + url, init) as never, { params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }) });
  }) as unknown as typeof fetch;
  const request = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const store = useConfigStore.getState(); const key = 'OutOfStaminaStunDuration';
  const params = { params: Promise.resolve({ path: ['Character', 'Stun'] }) };
  const capture: { cases: { value: number; command: string; review: string }[]; removal?: string[]; omittedUpsert?: string } = { cases: [] };
  store.setValue('Character', 'Chftp', 'ChftpStunDuration', 2.3);
  for (const value of [0.25, 0.6, 1.6, 0, 0.000001, 1.075]) {
    store.setValue('Character', 'Stun', key, value); await flushConfigWrites();
    const persisted = await read(request({}) as never, params); assert.equal(persisted.status, 200);
    assert.equal((await persisted.json()).data[key], value);
    const response = await preview(); assert.equal(response.status, 200);
    const rows = reviewRows((await response.json()).commands);
    const row = rows.find(row => row.database === 'Character' && row.category === 'Stun' && row.key === key)!;
    assert(row); assert.equal(row.value, String(value));
    const commands = selectedReviewCommands(rows, new Set([row.id])); assert.equal(commands.length, 1);
    assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
    assert.deepEqual(sent.at(-1), commands);
    const prefix = 'string ezconfig Character Stun '; assert(commands[0].startsWith(prefix));
    assert.deepEqual(JSON.parse(commands[0].slice(prefix.length)), { [key]: String(value) });
    capture.cases.push({ value, command: commands[0], review: row.value });
  }

  const before = writes;
  for (const value of [-1, Infinity, NaN, 1e40, Number.MIN_VALUE]) store.setValue('Character', 'Stun', key, value);
  await flushConfigWrites(); assert.equal(writes, before); assert.equal(store.getValue('Character', 'Stun', key), 1.075);
  for (const value of [-1, '0', 1e40, Number.MIN_VALUE]) {
    const rejected = await save(request({ entries: { [key]: value } }) as never, params); assert.equal(rejected.status, 400);
    assert.equal((await (await read(request({}) as never, params)).json()).data[key], 1.075);
  }

  // A manually damaged persisted value must fail before admitting a full apply
  // or sending its wipe, rather than relying on a later server rejection.
  await writeFile(join(root, 'Character', 'Stun.json'), JSON.stringify({ [key]: 1e40 }));
  const sentBeforeInvalid = sent.length;
  assert.equal((await apply(request({ wipeDatabase: true }))).status, 500);
  assert.equal(sent.length, sentBeforeInvalid);

  store.removeValue('Character', 'Stun', key); await flushConfigWrites();
  const response = await preview(); const rows = reviewRows((await response.json()).commands);
  assert(!rows.some(row => row.key === key));
  const commands = selectedReviewCommands(rows, new Set(rows.map(row => row.id)));
  assert.equal((await apply(request({ commands, wipeDatabase: true }))).status, 200);
  capture.removal = sent.at(-1)!;
  assert.equal(capture.removal[0], 'string ezconfig WipeDatabases');
  assert(!capture.removal.some(command => command.includes(key)));
  capture.omittedUpsert = 'string ezconfig Character Stun {}';
  if (process.env.EZ_STUN_CAPTURE_PATH) await writeFile(process.env.EZ_STUN_CAPTURE_PATH, JSON.stringify(capture, null, 2));
  console.log('PASS: real store/persistence/review/selected apply preserves zero/default/tiny-positive precision; rejects invalid edits before persistence and invalid saved values before wipe; removal uses replacement.');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root); assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-stun-duration-'));
  await rm(target, { recursive: true, force: true });
}
