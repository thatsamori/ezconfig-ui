import { successfulProcessingFixture } from './acknowledged-transport';
// Real store, persistence and review/apply handlers; only external RCON is mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-movement-walk-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = [];
const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({
  executeAcknowledgedBatch: async (commands: string[]) => { sent.push(commands); return successfulProcessingFixture(commands); },
}));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  // Route the store's HTTP requests directly into the real handler, without a live server.
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert(url.startsWith('/api/config/'));
    return save(new Request('http://localhost' + url, init) as never, {
      params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }),
    });
  }) as unknown as typeof fetch;
  const request = (body: unknown) => new Request('http://localhost/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const store = useConfigStore.getState();
  async function readRows() {
    await flushConfigWrites();
    const response = await preview();
    assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  store.setValue('Character', 'Parry', 'ParryUpTime', 0.31);
  store.setValue('Character', 'Movement', 'TimeToMaxSprint', 0.96);
  assert(!(await readRows()).some(row => row.key === 'MaxWalkSpeed'),
    'without a confirmed edit there is no saved walking override to review');

  for (const value of [0, -100, 450]) {
    store.setValue('Character', 'Movement', 'MaxWalkSpeed', value);
    const rows = await readRows();
    const walkRows = rows.filter(row => row.key === 'MaxWalkSpeed');
    assert.equal(walkRows.length, 1);
    assert.equal(walkRows[0].database, 'Character');
    assert.equal(walkRows[0].category, 'Movement');
    assert.equal(walkRows[0].value, value.toFixed(2));
    assert(rows.some(row => row.category === 'Movement' && row.key === 'TimeToMaxSprint' && row.value === '0.96'));
    assert(rows.some(row => row.category === 'Parry' && row.key === 'ParryUpTime'));
    const commands = selectedReviewCommands(rows, new Set(walkRows.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], [
      `string ezconfig Character Movement ${JSON.stringify({ MaxWalkSpeed: value.toFixed(2) })}`,
    ], 'unselected adjacent keys must not reach transport');
  }

  // The actual Reset store action removes only this key; wipe clears its prior server state.
  store.removeValue('Character', 'Movement', 'MaxWalkSpeed');
  assert.equal(useConfigStore.getState().getValue('Character', 'Movement', 'MaxWalkSpeed'), undefined);
  const resetRows = await readRows();
  assert(!resetRows.some(row => row.key === 'MaxWalkSpeed'));
  assert.equal(resetRows.length, 2);
  const remaining = selectedReviewCommands(resetRows, new Set(resetRows.map(row => row.id)));
  assert.equal((await apply(request({ commands: remaining, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...remaining]);
  assert(sent[sent.length - 1].some(command => command.includes('"TimeToMaxSprint":"0.96"')));
  assert(!sent[sent.length - 1].some(command => command.includes('MaxWalkSpeed')));
  console.log('PASS: MaxWalkSpeed store/save/review/selective transport, signed/zero values, TimeToMaxSprint coexistence, Reset and wipe/apply ordering');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-movement-walk-'));
  await rm(target, { recursive: true, force: true });
}
