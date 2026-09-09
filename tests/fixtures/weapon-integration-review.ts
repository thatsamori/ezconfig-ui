import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const parent = resolve(tmpdir()); const root = await mkdtemp(join(parent, 'ezconfig-weapon-integration-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = []; const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({ executeBatchCommands: async (commands: string[]) => { sent.push(commands); } }));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  globalThis.fetch = (async (url: string, init: RequestInit) => save(new Request('http://localhost' + url, init) as never, { params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }) })) as unknown as typeof fetch;
  const request = (commands: string[], wipeDatabase: boolean) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commands, wipeDatabase }) });
  const store = useConfigStore.getState();
  async function rows() { await flushConfigWrites(); const r = await preview(); assert.equal(r.status, 200); return reviewRows((await r.json()).commands); }
  async function sendAll() { const r = await rows(); const commands = selectedReviewCommands(r, new Set(r.map(row => row.id))); assert.equal((await apply(request(commands, true))).status, 200); assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...commands]); return sent[sent.length - 1]; }
  store.setValue('Weapon/MeatCleaver', 'Strike', 'Windup', .81);
  store.setValue('Weapon/MeatCleaver', 'Strike', 'Damage', [23, 24, 25, 26]);
  store.setValue('Weapon/MeatCleaver', 'General', 'CanBlock', false);
  store.setValue('Weapon/Polehammer', 'AltStrike', 'Windup', .97);
  store.setValue('Weapon/Polehammer', 'General', 'BlockStaminaNegation', 0);
  store.setValue('Weapon/Polehammer', 'General', 'SecondBlockStaminaNegation', 8.5);
  store.setValue('Weapon/Polehammer', 'General', 'ParryBoxTransformLocation', { x: 17, y: -9, z: 3 });
  store.setValue('Weapon/ArmingSword', 'Strike', 'Release', .28);
  const movement = { MaxWalkSpeed: 120, SprintModifier: 1.9, SubSprintSpeedBonusEquipped: 0, SecondSubSprintSpeedBonusEquipped: .25, AttackSupersprintDuration: .43, SecondAttackSupersprintDuration: .19, TimeToMaxSprint: .6 };
  for (const [key, value] of Object.entries(movement)) store.setValue('Character', 'Movement', key, value);
  const initial = await sendAll();
  assert(initial.includes('string ezconfig MeatCleaver General {"CanBlock":"False"}'));
  const mc = initial.find(command => command.startsWith('string ezconfig MeatCleaver Strike '))!;
  assert.deepEqual(JSON.parse(mc.slice('string ezconfig MeatCleaver Strike '.length)), { Damage: '23.00,24.00,25.00,26.00', Windup: '0.81' });
  store.setValue('Weapon/MeatCleaver', 'Strike', 'Windup', .86);
  store.setValue('Character', 'Movement', 'AttackSupersprintDuration', .12);
  const review = await rows();
  const selectedRows = review.filter(row => (row.database === 'MeatCleaver' && row.category === 'Strike' && row.key === 'Windup') || (row.database === 'Character' && row.key === 'AttackSupersprintDuration'));
  assert.equal(selectedRows.length, 2);
  const selected = selectedReviewCommands(review, new Set(selectedRows.map(row => row.id)));
  assert.deepEqual(new Set(selected), new Set(['string ezconfig MeatCleaver Strike {"Windup":"0.86"}', 'string ezconfig Character Movement {"AttackSupersprintDuration":"0.12"}']));
  assert.equal((await apply(request(selected, false))).status, 200); assert.deepEqual(sent[sent.length - 1], selected);
  store.removeValue('Weapon/MeatCleaver', 'Strike', 'Damage');
  store.removeValue('Weapon/Polehammer', 'General', 'BlockStaminaNegation');
  const removed = await rows(); assert(!removed.some(row => row.key === 'Damage' || row.key === 'BlockStaminaNegation'));
  assert(removed.some(row => row.key === 'CanBlock' && row.value === 'False'));
  assert(removed.some(row => row.key === 'SubSprintSpeedBonusEquipped' && row.value === '0.00'));
  const afterRemoval = await sendAll();
  if (process.env.EZ_WEAPON_CAPTURE_PATH) await writeFile(process.env.EZ_WEAPON_CAPTURE_PATH, JSON.stringify({ initial, selected, afterRemoval }, null, 2));
  console.log('PASS: combined saved Weapon/Movement, independent roster categories, explicit false/zero, selection, array transport, removal and exact wipe ordering');
} finally {
  globalThis.fetch = originalFetch; const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-weapon-integration-'));
  await rm(target, { recursive: true, force: true });
}
