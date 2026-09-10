import { successfulProcessingFixture } from './acknowledged-transport';
// Real persistence and review/apply handlers, with isolated data and only RCON mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const tempParent = resolve(tmpdir());
const root = await mkdtemp(join(tempParent, 'ezconfig-recovery-stamina-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = [];
mock.module('../../src/lib/rcon/service', () => ({
  executeAcknowledgedBatch: async (commands: string[]) => { sent.push(commands); return successfulProcessingFixture(commands); },
}));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const request = (body: unknown) => new Request('http://localhost/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  async function saveCategory(category: string, entries: Record<string, number>) {
    const result = await save(request({ entries }) as never, { params: Promise.resolve({ path: ['Character', category] }) });
    assert.equal(result.status, 200, JSON.stringify(await result.json()));
  }
  async function readRows() {
    const result = await preview();
    assert.equal(result.status, 200);
    return reviewRows((await result.json()).commands);
  }
  await saveCategory('Parry', { ParryUpTime: 0.31 });
  assert(!(await readRows()).some(row => row.category === 'Recovery'),
    'an unsaved recovery override contributes no review row');

  for (const value of [0, -1, 2]) {
    await saveCategory('Recovery', { WorldRecoveryTime: 0.75, WorldMissStaminaFactor: value });
    const rows = await readRows();
    const recoveryRows = rows.filter(row => row.category === 'Recovery' && row.key === 'WorldMissStaminaFactor');
    assert.equal(recoveryRows.length, 1);
    assert.equal(recoveryRows[0].database, 'Character');
    assert.equal(recoveryRows[0].key, 'WorldMissStaminaFactor');
    assert.equal(recoveryRows[0].value, value.toFixed(2));
    assert(rows.some(row => row.category === 'Parry' && row.key === 'ParryUpTime'));
    const commands = selectedReviewCommands(rows, new Set(recoveryRows.map(row => row.id)));
    const result = await apply(request({ commands, wipeDatabase: false }));
    assert.equal(result.status, 200);
    assert.deepEqual(sent[sent.length - 1], [
      `string ezconfig Character Recovery ${JSON.stringify({ WorldMissStaminaFactor: value.toFixed(2) })}`,
    ], 'only the selected recovery value reaches transport');
  }

  // Removing just the duration never manufactures it when the stamina factor is saved.
  await saveCategory('Recovery', { WorldMissStaminaFactor: 0 });
  const onlyStamina = (await readRows()).filter(row => row.category === 'Recovery');
  assert.deepEqual(onlyStamina.map(row => row.key), ['WorldMissStaminaFactor']);

  // Removing just the factor preserves the independent duration.
  await saveCategory('Recovery', { WorldRecoveryTime: 0.75 });
  const onlyDuration = (await readRows()).filter(row => row.category === 'Recovery');
  assert.deepEqual(onlyDuration.map(row => row.key), ['WorldRecoveryTime']);

  // Reset removes the saved override, while normal wipe-and-apply clears its server value.
  await saveCategory('Recovery', {});
  const resetRows = await readRows();
  assert(!resetRows.some(row => row.key === 'WorldMissStaminaFactor'));
  assert.equal(resetRows.length, 1);
  assert.equal(resetRows[0].key, 'ParryUpTime');
  const remaining = selectedReviewCommands(resetRows, new Set(resetRows.map(row => row.id)));
  const reset = await apply(request({ commands: remaining, wipeDatabase: true }));
  assert.equal(reset.status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...remaining]);
  console.log('PASS: WorldMissStaminaFactor save, review, selection, zero, negative, coexistence and Reset');
} finally {
  const target = resolve(root);
  assert(target.startsWith(tempParent + sep) && target.slice(tempParent.length + 1).startsWith('ezconfig-recovery-stamina-'));
  await rm(target, { recursive: true, force: true });
}
