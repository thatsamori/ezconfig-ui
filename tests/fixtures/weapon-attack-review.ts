import { successfulProcessingFixture } from './acknowledged-transport';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-weapon-attack-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = [];
const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({ executeAcknowledgedBatch: async (commands: string[]) => { sent.push(commands); return successfulProcessingFixture(commands); } }));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  const { lookupDefault } = await import('../../src/lib/config/defaults');
  globalThis.fetch = (async (url: string, init: RequestInit) => save(new Request('http://localhost' + url, init) as never, {
    params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }),
  })) as unknown as typeof fetch;
  const request = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const store = useConfigStore.getState();
  async function rows() { await flushConfigWrites(); const response = await preview(); assert.equal(response.status, 200); return reviewRows((await response.json()).commands); }
  const values = {
    Strike: { HitKnockbackFactor: 0, CanCombo: false, Damage: [12, 34, 56, 78], FeintCost: -2.7, Turncap: { x: 27, y: 31 } },
    AltStrike: { HitKnockbackFactor: 2.5, CanCombo: true, Damage: [90, 80, 70, 60] },
    Stab: { Release: .31, HeadBonus: [1, 1.1, 1.2, 1.3] },
    AltStab: { Release: .72, LegBonus: [.7, .8, .9, 1] },
  };
  const expected = {
    Strike: { HitKnockbackFactor: '0.00', CanCombo: 'False', Damage: '12.00,34.00,56.00,78.00', FeintCost: '-2.70', Turncap: 'X=27.00,Y=31.00,Z=0.00' },
    AltStrike: { HitKnockbackFactor: '2.50', CanCombo: 'True', Damage: '90.00,80.00,70.00,60.00' },
    Stab: { Release: '0.31', HeadBonus: '1.00,1.10,1.20,1.30' },
    AltStab: { Release: '0.72', LegBonus: '0.70,0.80,0.90,1.00' },
  };
  store.setValue('Character', 'Movement', 'SprintModifier', 1.9);
  store.setValue('Weapon/Greatsword', 'Strike', 'Damage', [80, 70, 60, 50]);
  for (const [category, fields] of Object.entries(values)) for (const [key, value] of Object.entries(fields)) store.setValue('Weapon/ArmingSword', category, key, value);
  const review = await rows();
  const all = selectedReviewCommands(review, new Set(review.map(row => row.id)));
  for (const category of Object.keys(values)) {
    const prefix = `string ezconfig ArmingSword ${category} `;
    const command = all.find(command => command.startsWith(prefix)); assert(command);
    assert.deepEqual(JSON.parse(command.slice(prefix.length)), expected[category as keyof typeof expected]);
  }
  const only = review.filter(row => row.key === 'HitKnockbackFactor'); assert.equal(only.length, 2);
  const selected = selectedReviewCommands(review, new Set(only.map(row => row.id)));
  assert.equal((await apply(request({ commands: selected, wipeDatabase: false }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], selected);
  assert.equal(selected.length, 2); assert(selected.every(command => !command.includes('Damage') && !command.includes('CanCombo')));
  store.removeValue('Weapon/ArmingSword', 'Strike', 'HitKnockbackFactor');
  store.removeValue('Weapon/ArmingSword', 'AltStrike', 'Damage');
  const after = await rows();
  assert.equal(after.filter(row => row.key === 'HitKnockbackFactor').length, 1);
  assert.equal(after.filter(row => row.key === 'Damage').length, 2);
  const commands = selectedReviewCommands(after, new Set(after.map(row => row.id)));
  assert.equal((await apply(request({ commands, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...commands]);
  assert(after.some(row => row.key === 'CanCombo' && row.value === 'False'));
  assert(after.some(row => row.key === 'SprintModifier'));
  assert.equal(typeof lookupDefault('Weapon/ArmingSword', 'Strike', 'HitKnockbackFactor').defaultValue, 'number');
  assert(Array.isArray(lookupDefault('Weapon/ArmingSword', 'AltStrike', 'Damage').defaultValue));
  if (process.env.EZ_WEAPON_CAPTURE_PATH) await writeFile(process.env.EZ_WEAPON_CAPTURE_PATH, JSON.stringify({ initial: all, selected, afterRemoval: sent[sent.length - 1] }, null, 2));
  console.log('PASS: public knockback spelling, typed arrays/bools/int-input/vector, persistence, review, independent categories, selection, reset, exact wipe ordering and actual defaults');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root); assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-weapon-attack-'));
  await rm(target, { recursive: true, force: true });
}
