import { successfulProcessingFixture } from './acknowledged-transport';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-geometry-components-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = []; const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({ executeAcknowledgedBatch: async (commands: string[]) => { sent.push([...commands]); return successfulProcessingFixture(commands); } }));
try {
  const { POST: save, GET: read } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  globalThis.fetch = (async (url: string, init: RequestInit) => save(new Request('http://localhost' + url, init) as never, { params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }) })) as unknown as typeof fetch;
  const request = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const store = useConfigStore.getState(); const x = 'ForwardParryLength', y = 'ForwardParryHalfWidth';
  const capture: { name: string; commands: string[]; expected: Record<string, number> }[] = [];
  async function applyStored(name: string, expected: Record<string, number>, selected?: string[]) {
    await flushConfigWrites();
    const persisted = await read(request({}) as never, { params: Promise.resolve({ path: ['Character', 'Parry'] }) });
    assert.deepEqual((await persisted.json()).data, expected);
    const rows = reviewRows((await (await preview()).json()).commands);
    const chosen = rows.filter(row => !selected || selected.includes(row.key));
    const commands = selectedReviewCommands(rows, new Set(chosen.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: !selected }))).status, 200);
    const output = sent.at(-1)!;
    assert.equal(output[0] === 'string ezconfig WipeDatabases', !selected);
    for (const key of [x,y]) assert.equal(output.some(c => c.includes(key)), key in expected && (!selected || selected.includes(key)));
    capture.push({ name, commands: output, expected });
  }
  store.setValue('Character', 'Parry', y, 100);
  await applyStored('width-only', { [y]: 100 });
  store.setValue('Character', 'Parry', x, 75);
  await applyStored('width-then-length', { [y]: 100, [x]: 75 });
  await applyStored('select-only-width', { [y]: 100, [x]: 75 }, [y]);
  store.removeValue('Character', 'Parry', y);
  await applyStored('remove-width-retain-length', { [x]: 75 });
  store.setValue('Character', 'Parry', y, -5);
  await applyStored('length-then-width', { [x]: 75, [y]: -5 });
  store.removeValue('Character', 'Parry', x);
  await applyStored('remove-length-retain-width', { [y]: -5 });
  store.removeValue('Character', 'Parry', y);
  await applyStored('remove-all', {});
  if (process.env.EZ_GEOMETRY_COMPONENT_CAPTURE_PATH) await writeFile(process.env.EZ_GEOMETRY_COMPONENT_CAPTURE_PATH, JSON.stringify(capture, null, 2));
  console.log('PASS: independent persisted presence/order, selected apply, and replacement removing either component.');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root); assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-geometry-components-'));
  await rm(target, { recursive: true, force: true });
}
