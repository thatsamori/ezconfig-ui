// Real store, persistence and review/apply; isolated data and only external RCON mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-movement-sprint-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = [];
const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({
  executeBatchCommands: async (commands: string[]) => { sent.push(commands); },
}));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
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
    const response = await preview(); assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  const prefix = 'string ezconfig Character Movement ';
  const fields = {
    PartialSprintModifier: 0, SprintModifier: -.5, SprintAcceleration: 350,
    SupersprintModifier: 2.3, TimeToMaxSprint: .8,
  };
  async function selectedFields(keys: string[]) {
    const rows = await readRows();
    const commands = selectedReviewCommands(rows, new Set(rows.filter(row => row.category === 'Movement' && keys.includes(row.key)).map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    assert.equal(commands.length, 1); assert(commands[0].startsWith(prefix));
    return JSON.parse(commands[0].slice(prefix.length));
  }
  store.setValue('Character', 'Movement', 'MaxWalkSpeed', 200);
  store.setValue('Character', 'Movement', 'MaxWalkSpeedCrouched', 80);
  store.setValue('Character', 'Recovery', 'WorldRecoveryTime', .8);
  assert(!(await readRows()).some(row => row.key in fields));
  const formatted = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.toFixed(2)]));
  for (const entries of [Object.entries(fields), Object.entries(fields).reverse()]) {
    for (const key of Object.keys(fields)) store.removeValue('Character', 'Movement', key);
    await flushConfigWrites();
    for (const [key, value] of entries) store.setValue('Character', 'Movement', key, value);
    assert.deepEqual(await selectedFields(Object.keys(fields)), formatted, 'sprint controls and TimeToMaxSprint do not depend on insertion order');
  }
  for (const key of Object.keys(fields)) {
    for (const value of [0, -.25, 1.25]) {
      store.setValue('Character', 'Movement', key, value);
      assert.deepEqual(await selectedFields([key]), { [key]: value.toFixed(2) }, 'only the independent selected key reaches RCON');
    }
    store.setValue('Character', 'Movement', key, fields[key as keyof typeof fields]);
  }
  store.removeValue('Character', 'Movement', 'SprintAcceleration');
  store.removeValue('Character', 'Movement', 'PartialSprintModifier');
  const partial = await readRows();
  assert(!partial.some(row => ['SprintAcceleration', 'PartialSprintModifier'].includes(row.key)));
  assert.deepEqual(await selectedFields(Object.keys(fields)), {
    SprintModifier: '-0.50', SupersprintModifier: '2.30', TimeToMaxSprint: '0.80',
  });
  const commands = selectedReviewCommands(partial, new Set(partial.map(row => row.id)));
  assert.equal((await apply(request({ commands, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...commands]);
  assert(partial.some(row => row.key === 'MaxWalkSpeed' && row.value === '200.00'));
  assert(partial.some(row => row.key === 'MaxWalkSpeedCrouched' && row.value === '80.00'));
  assert(partial.some(row => row.category === 'Recovery'));
  for (const key of Object.keys(fields)) store.removeValue('Character', 'Movement', key);
  const cleared = await readRows();
  assert(!cleared.some(row => row.key in fields));
  assert.equal(cleared.length, 3);
  console.log('PASS: four sprint controls plus TimeToMaxSprint, independent signed/zero inputs, insertion order, partial selection/Reset, wipe ordering and adjacent controls');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-movement-sprint-'));
  await rm(target, { recursive: true, force: true });
}
