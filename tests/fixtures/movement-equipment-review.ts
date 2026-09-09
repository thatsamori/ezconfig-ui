// Real store, persistence and review/apply; isolated data and only external RCON mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-movement-equipment-'));
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
  const fields = { SubSprintSpeedBonusEquipped: 0, SecondSubSprintSpeedBonusEquipped: -75.5 };
  async function selectedFields(keys: string[]) {
    const rows = await readRows();
    const commands = selectedReviewCommands(rows, new Set(rows.filter(row => row.category === 'Movement' && keys.includes(row.key)).map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    assert.equal(commands.length, 1); assert(commands[0].startsWith(prefix));
    return JSON.parse(commands[0].slice(prefix.length));
  }
  store.setValue('Character', 'Movement', 'SprintModifier', 1.9);
  store.setValue('Character', 'Movement', 'TimeToMaxSprint', .8);
  store.setValue('Character', 'Movement', 'MaxWalkSpeedCrouched', 90);
  store.setValue('Character', 'Recovery', 'WorldRecoveryTime', .8);
  assert(!(await readRows()).some(row => row.key in fields));
  const formatted = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.toFixed(2)]));
  for (const entries of [Object.entries(fields), Object.entries(fields).reverse()]) {
    for (const key of Object.keys(fields)) store.removeValue('Character', 'Movement', key);
    await flushConfigWrites();
    for (const [key, value] of entries) store.setValue('Character', 'Movement', key, value);
    assert.deepEqual(await selectedFields(Object.keys(fields)), formatted, 'main and alternate inputs do not depend on insertion order');
  }
  for (const key of Object.keys(fields)) {
    for (const value of [0, -125, 80.5]) {
      store.setValue('Character', 'Movement', key, value);
      assert.deepEqual(await selectedFields([key]), { [key]: value.toFixed(2) }, 'selecting one mode must not send its sibling or sprint values');
    }
    store.setValue('Character', 'Movement', key, fields[key as keyof typeof fields]);
  }
  for (const [removed, retained] of [
    ['SubSprintSpeedBonusEquipped', 'SecondSubSprintSpeedBonusEquipped'],
    ['SecondSubSprintSpeedBonusEquipped', 'SubSprintSpeedBonusEquipped'],
  ]) {
    for (const [key, value] of Object.entries(fields)) store.setValue('Character', 'Movement', key, value);
    store.removeValue('Character', 'Movement', removed);
    const rows = await readRows();
    assert(!rows.some(row => row.key === removed));
    assert.deepEqual(await selectedFields(Object.keys(fields)), { [retained]: fields[retained as keyof typeof fields].toFixed(2) });
    const commands = selectedReviewCommands(rows, new Set(rows.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: true }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...commands]);
    assert(rows.some(row => row.key === 'SprintModifier' && row.value === '1.90'));
    assert(rows.some(row => row.key === 'TimeToMaxSprint' && row.value === '0.80'));
    assert(rows.some(row => row.key === 'MaxWalkSpeedCrouched' && row.value === '90.00'));
    assert(rows.some(row => row.category === 'Recovery'));
  }
  for (const key of Object.keys(fields)) store.removeValue('Character', 'Movement', key);
  const cleared = await readRows();
  assert(!cleared.some(row => row.key in fields));
  assert.equal(cleared.length, 4);
  console.log('PASS: independent main/alternate equipment subsprint values, signed/zero/order, partial selection/Reset, wipe ordering and existing sprint/crouch/Recovery');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-movement-equipment-'));
  await rm(target, { recursive: true, force: true });
}
