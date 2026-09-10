import { successfulProcessingFixture } from './acknowledged-transport';
// Real persistence/review/apply with isolated storage and only external RCON mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-movement-duration-'));
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
  const fields = { AttackSupersprintDuration: 0, SecondAttackSupersprintDuration: -.25 };
  const keys = Object.keys(fields);
  const prefix = 'string ezconfig Character Movement ';
  async function readRows() {
    await flushConfigWrites();
    const response = await preview(); assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  async function selectedFields(selectedKeys: string[]) {
    const rows = await readRows();
    const commands = selectedReviewCommands(rows, new Set(rows.filter(row => row.category === 'Movement' && selectedKeys.includes(row.key)).map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    assert.equal(commands.length, 1); assert(commands[0].startsWith(prefix));
    return JSON.parse(commands[0].slice(prefix.length));
  }
  store.setValue('Character', 'Movement', 'SupersprintModifier', 2.3);
  store.setValue('Character', 'Movement', 'SprintAcceleration', 200);
  store.setValue('Character', 'Movement', 'TimeToMaxSprint', .8);
  store.setValue('Character', 'Movement', 'SubSprintSpeedBonusEquipped', -.2);
  store.setValue('Character', 'Recovery', 'WorldRecoveryTime', .8);
  assert(!(await readRows()).some(row => keys.includes(row.key)), 'absent durations create no review overrides');

  for (const entries of [Object.entries(fields), Object.entries(fields).reverse()]) {
    for (const key of keys) store.removeValue('Character', 'Movement', key);
    await flushConfigWrites();
    for (const [key, value] of entries) store.setValue('Character', 'Movement', key, value);
    assert.deepEqual(await selectedFields(keys), { AttackSupersprintDuration: '0.00', SecondAttackSupersprintDuration: '-0.25' }, 'logical mode values are independent of insertion order');
  }
  for (const key of keys) {
    for (const value of [0, -.25, .45]) {
      store.setValue('Character', 'Movement', key, value);
      assert.deepEqual(await selectedFields([key]), { [key]: value.toFixed(2) }, 'partial selection sends only that mode with literal signed/zero value');
    }
  }
  for (const [removed, retained] of [
    ['AttackSupersprintDuration', 'SecondAttackSupersprintDuration'],
    ['SecondAttackSupersprintDuration', 'AttackSupersprintDuration'],
  ]) {
    for (const [key, value] of Object.entries(fields)) store.setValue('Character', 'Movement', key, value);
    store.removeValue('Character', 'Movement', removed);
    const rows = await readRows();
    assert(!rows.some(row => row.key === removed));
    assert.deepEqual(await selectedFields(keys), { [retained]: fields[retained as keyof typeof fields].toFixed(2) }, 'Reset of one mode preserves its sibling, including explicit zero');
    const commands = selectedReviewCommands(rows, new Set(rows.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: true }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...commands]);
    assert(rows.some(row => row.key === 'SupersprintModifier' && row.value === '2.30'));
    assert(rows.some(row => row.key === 'SprintAcceleration' && row.value === '200.00'));
    assert(rows.some(row => row.key === 'TimeToMaxSprint' && row.value === '0.80'));
    assert(rows.some(row => row.key === 'SubSprintSpeedBonusEquipped' && row.value === '-0.20'));
    assert(rows.some(row => row.category === 'Recovery'));
  }
  for (const key of keys) store.removeValue('Character', 'Movement', key);
  const cleared = await readRows();
  assert(!cleared.some(row => keys.includes(row.key)));
  assert.equal(cleared.length, 5);
  const remainingCommands = selectedReviewCommands(cleared, new Set(cleared.map(row => row.id)));
  assert.equal((await apply(request({ commands: remainingCommands, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...remainingCommands]);
  assert(!remainingCommands.some(command => command.includes('AttackSupersprintDuration')));
  console.log('PASS: independent attack duration modes, literal/order/partial selection, Reset and wipe transport, existing speed/equipment/Recovery coexistence');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-movement-duration-'));
  await rm(target, { recursive: true, force: true });
}
