// Ticket 03: real store/persistence/review/apply, with only RCON mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-weapon-general-'));
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
  const { reviewRows, selectedReviewCommands, weapons } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  const { lookupDefault } = await import('../../src/lib/config/defaults');
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
  async function applyRows(rows: ReturnType<typeof reviewRows>, names?: string[], wipe = false) {
    const selected = rows.filter(row => !names || names.includes(row.database));
    const commands = selectedReviewCommands(rows, new Set(selected.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: wipe }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], wipe ? ['string ezconfig WipeDatabases', ...commands] : commands);
    return sent[sent.length - 1];
  }
  const values = {
    CanBlock: false,
    BlockStaminaNegation: 0,
    SecondBlockStaminaNegation: 17.5,
    BlockStaminaClamp: { x: 0, y: 19 },
    ParryBoxTransformLocation: { x: 11, y: 22, z: 33 },
    ParryBoxTransformRotation: { x: 5, y: 7, z: 9 },
    ParryBoxTransformScale: { x: 1.1, y: 1.2, z: 1.3 },
  };
  for (const [key, value] of Object.entries(values)) {
    assert(lookupDefault('Spear', 'General', key).defaultValue !== undefined);
    store.setValue('Spear', 'General', key, value);
  }
  for (const category of ['Strike', 'AltStrike', 'Stab', 'AltStab']) {
    assert(lookupDefault('Spear', category, 'ForcesRearingFromFront').defaultValue !== undefined);
    store.setValue('Spear', category, 'ForcesRearingFromFront', category !== 'AltStrike');
  }
  let rows = await readRows();
  assert.equal(rows.length, 11);
  assert.equal(rows.find(row => row.key === 'CanBlock')!.value, 'False');
  assert.equal(rows.find(row => row.key === 'BlockStaminaNegation')!.value, '0.00');
  assert.equal(rows.find(row => row.key === 'ParryBoxTransformLocation')!.value, 'X=11.00,Y=22.00,Z=33.00');
  assert.equal(rows.find(row => row.key === 'ParryBoxTransformRotation')!.value, 'X=5.00,Y=7.00,Z=9.00');
  assert.equal(rows.find(row => row.key === 'ParryBoxTransformScale')!.value, 'X=1.10,Y=1.20,Z=1.30');
  assert.equal(rows.find(row => row.category === 'AltStrike')!.value, 'False');
  assert.equal(rows.filter(row => row.key === 'ForcesRearingFromFront').length, 4);
  const initialCommands = await applyRows(rows, undefined, true);
  // Individual review selection must exclude every neighboring key/category.
  for (const row of rows) {
    const commands = selectedReviewCommands(rows, new Set([row.id]));
    assert.equal(commands.length, 1);
    assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    const prefix = `string ezconfig ${row.database} ${row.category} `;
    assert(commands[0].startsWith(prefix));
    assert.deepEqual(JSON.parse(commands[0].slice(prefix.length)), { [row.key]: row.value });
  }
  const rearingStages: Record<string, string[]> = {};
  for (const [label, value] of [['enabled', true], ['disabled', false]] as const) {
    store.setValue('Spear', 'Stab', 'ForcesRearingFromFront', value);
    rows = await readRows();
    const row = rows.find(row => row.category === 'Stab' && row.key === 'ForcesRearingFromFront')!;
    assert.equal(row.value, value ? 'True' : 'False');
    const commands = selectedReviewCommands(rows, new Set([row.id]));
    assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    rearingStages[label] = commands;
  }
  store.removeValue('Spear', 'General', 'ParryBoxTransformLocation');
  store.removeValue('Spear', 'Stab', 'ForcesRearingFromFront');
  rows = await readRows();
  assert(!rows.some(row => row.key === 'ParryBoxTransformLocation'));
  assert(!rows.some(row => row.category === 'Stab'));
  assert(rows.some(row => row.key === 'ParryBoxTransformRotation'));
  assert(rows.some(row => row.key === 'ParryBoxTransformScale'));
  assert.equal(rows.filter(row => row.key === 'ForcesRearingFromFront').length, 3);
  const removalCommands = await applyRows(rows, undefined, true);
  const rearingCategoryBatches: Record<string, string[]> = {};
  const rearingRemovalBatches: Record<string, { before: string[]; remove: string[] }> = {};
  const attackCategories = ['Strike', 'AltStrike', 'Stab', 'AltStab'];
  async function captureRearing(wipe = false) {
    const saved = (await readRows()).filter(row => row.key === 'ForcesRearingFromFront');
    const commands = selectedReviewCommands(saved, new Set(saved.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: wipe }))).status, 200);
    const actual = sent[sent.length - 1];
    assert.deepEqual(actual, wipe ? ['string ezconfig WipeDatabases', ...commands] : commands);
    return actual;
  }
  for (const [label, value] of [['allTrue', true], ['allFalse', false]] as const) {
    for (const category of attackCategories) store.setValue('Spear', category, 'ForcesRearingFromFront', value);
    const batch = await captureRearing();
    assert.equal(batch.length, 4);
    for (const category of attackCategories) {
      const prefix = `string ezconfig Spear ${category} `;
      const command = batch.find(item => item.startsWith(prefix)); assert(command);
      assert.deepEqual(JSON.parse(command.slice(prefix.length)), { ForcesRearingFromFront: value ? 'True' : 'False' });
    }
    rearingCategoryBatches[label] = batch;
  }
  for (const removedCategory of attackCategories) {
    for (const category of attackCategories) {
      const baseline = lookupDefault('Spear', category, 'ForcesRearingFromFront').defaultValue;
      assert.equal(typeof baseline, 'boolean');
      store.setValue('Spear', category, 'ForcesRearingFromFront', !baseline);
    }
    const before = await captureRearing();
    store.removeValue('Spear', removedCategory, 'ForcesRearingFromFront');
    const remove = await captureRearing(true);
    assert.equal(before.length, 4); assert.equal(remove.length, 4);
    assert(!remove.some(command => command.startsWith(`string ezconfig Spear ${removedCategory} `)));
    rearingRemovalBatches[removedCategory] = { before, remove };
  }
  if (process.env.EZCONFIG_CAPTURE_GENERAL_COMMANDS === '1') {
    const directory = resolve('.scratch/weapon-reliability-ui');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'ticket03-captured-rcon.json'), JSON.stringify({
      source: 'Real store -> temporary persistence -> review -> selected apply -> captured RCON',
      initialCommands, removalCommands, rearingStages, rearingCategoryBatches, rearingRemovalBatches, values,
    }, null, 2) + '\n');
  }
  console.log('PASS: General scalar/boolean/transform controls and all four ForcesRearingFromFront categories persist/review/select/apply/reset with explicit false/zero');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-weapon-general-'));
  await rm(target, { recursive: true, force: true });
}
