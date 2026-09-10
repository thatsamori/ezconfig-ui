import { successfulProcessingFixture } from './acknowledged-transport';
// Install in tests/fixtures when ticket05 receives its integration lease.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const tempParent = resolve(tmpdir());
const root = await mkdtemp(join(tempParent, 'ezconfig-parry-angles-'));
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
  const prefix = 'string ezconfig Character Parry ';
  async function saveRows(entries: Record<string, number | boolean>) {
    const result = await save(request({ entries }) as never, { params: Promise.resolve({ path: ['Character', 'Parry'] }) });
    assert.equal(result.status, 200, JSON.stringify(await result.json()));
    const response = await preview();
    assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  async function sendSelection(rows: ReturnType<typeof reviewRows>, keys: string[]) {
    const commands = selectedReviewCommands(rows, new Set(rows.filter(row => keys.includes(row.key)).map(row => row.id)));
    const result = await apply(request({ commands, wipeDatabase: false }));
    assert.equal(result.status, 200);
    const actual = sent[sent.length - 1];
    assert.deepEqual(actual, commands);
    assert.equal(actual.length, 1);
    assert(actual[0].startsWith(prefix));
    return JSON.parse(actual[0].slice(prefix.length));
  }

  for (const key of ['MaxParryAngle', 'MaxParryWeaponAngle']) {
    const rows = await saveRows({ [key]: 0 });
    assert.equal(rows.length, 1, 'one configured angle creates only one review row');
    assert.equal(rows[0].key, key);
    assert.equal(rows[0].value, '0.00');
    assert.deepEqual(await sendSelection(rows, [key]), { [key]: '0.00' });
  }

  const pair = await saveRows({ MaxParryAngle: 17.25, MaxParryWeaponAngle: 63.5, TrueCombo: false });
  assert.deepEqual(await sendSelection(pair, ['MaxParryWeaponAngle']), { MaxParryWeaponAngle: '63.50' });
  assert.deepEqual(await sendSelection(pair, ['MaxParryAngle', 'MaxParryWeaponAngle']), {
    MaxParryAngle: '17.25', MaxParryWeaponAngle: '63.50',
  });

  // Reset saves the remaining category entries; it must remove only this key.
  const reset = await saveRows({ MaxParryWeaponAngle: 63.5, TrueCombo: false });
  assert(!reset.some(row => row.key === 'MaxParryAngle'));
  assert(reset.some(row => row.key === 'TrueCombo' && row.value === 'False'));
  assert.deepEqual(await sendSelection(reset, ['MaxParryWeaponAngle']), { MaxParryWeaponAngle: '63.50' });
  const resetCommands = selectedReviewCommands(reset, new Set(reset.map(row => row.id)));
  const resetApplied = await apply(request({ commands: resetCommands, wipeDatabase: true }));
  assert.equal(resetApplied.status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...resetCommands],
    'normal reset application wipes stale server overrides before applying the remaining saved keys');
  console.log('PASS: independent parry angles preserve zero, distinct values, single-key selection and Reset through real UI handlers');
} finally {
  const target = resolve(root);
  assert(target.startsWith(tempParent + sep) && target.slice(tempParent.length + 1).startsWith('ezconfig-parry-angles-'));
  await rm(target, { recursive: true, force: true });
}
