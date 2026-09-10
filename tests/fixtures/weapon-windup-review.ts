import { successfulProcessingFixture } from './acknowledged-transport';
// Real persistence/review/apply with only external RCON mocked and isolated data.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-weapon-windup-'));
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
  const { lookupDefault } = await import('../../src/lib/config/defaults');
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
  async function rows() {
    await flushConfigWrites();
    const response = await preview(); assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  const categories = ['Strike', 'AltStrike', 'Stab', 'AltStab'];
  const values = [0, .72, -.15, .91];
  store.setValue('Weapon/Greatsword', 'Strike', 'Release', .8);
  store.setValue('Character', 'Movement', 'SprintModifier', 1.9);
  assert(!(await rows()).some(row => row.key === 'Windup'));
  for (const order of [categories, [...categories].reverse()]) {
    for (const category of categories) store.removeValue('Weapon/ArmingSword', category, 'Windup');
    await flushConfigWrites();
    for (const category of order) store.setValue('Weapon/ArmingSword', category, 'Windup', values[categories.indexOf(category)]);
    const review = await rows();
    for (const category of categories) {
      const selected = review.filter(row => row.key === 'Windup' && row.category === category);
      assert.equal(selected.length, 1);
      const commands = selectedReviewCommands(review, new Set(selected.map(row => row.id)));
      assert.deepEqual(commands, [`string ezconfig ArmingSword ${category} {"Windup":"${values[categories.indexOf(category)].toFixed(2)}"}`]);
      assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
      assert.deepEqual(sent[sent.length - 1], commands);
    }
  }
  // Removing one logical category keeps its siblings and unrelated weapons/Character keys.
  store.removeValue('Weapon/ArmingSword', 'AltStrike', 'Windup');
  const after = await rows();
  assert.equal(after.filter(row => row.key === 'Windup').length, 3);
  assert(!after.some(row => row.key === 'Windup' && row.category === 'AltStrike'));
  assert(after.some(row => row.key === 'Release') && after.some(row => row.key === 'SprintModifier'));
  const commands = selectedReviewCommands(after, new Set(after.map(row => row.id)));
  assert.equal((await apply(request({ commands, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...commands]);
  for (const category of categories) store.removeValue('Weapon/ArmingSword', category, 'Windup');
  assert(!(await rows()).some(row => row.key === 'Windup'));
  store.setValue('Weapon/ArmingSword', 'AltStrike', 'Windup', .33);
  assert.equal((await rows()).filter(row => row.key === 'Windup').length, 1);
  // Actual-default metadata remains weapon/mode specific after explicit reset.
  assert.deepEqual(lookupDefault('Weapon/ArmingSword', 'Strike', 'Windup').defaultValue, .475);
  assert.deepEqual(lookupDefault('Weapon/ArmingSword', 'AltStrike', 'Windup').defaultValue, .4);
  console.log('PASS: four Windup categories, persisted zero/negative/order, partial selection, removal/reapply, exact wipe ordering and mode defaults');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-weapon-windup-'));
  await rm(target, { recursive: true, force: true });
}
