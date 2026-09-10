import { successfulProcessingFixture } from './acknowledged-transport';
// Copy to the UI tests/fixtures directory after schema integration.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const tempParent = resolve(tmpdir());
const root = await mkdtemp(join(tempParent, 'ezconfig-parry-detector-'));
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
  const key = 'GiveMissParryIfFlinchedBeforeDuration';
  for (const window of [0, 1.25]) {
    const entries = { [key]: window, TrueCombo: false, TrueComboRecoveryTime: .73, TrueComboStamina: -17 };
    const saved = await save(request({ entries }) as never, { params: Promise.resolve({ path: ['Character', 'Parry'] }) });
    assert.equal(saved.status, 200, JSON.stringify(await saved.json()));
    const response = await preview();
    assert.equal(response.status, 200);
    const rows = reviewRows((await response.json()).commands);
    assert.equal(rows.find(row => row.key === key)?.value, window.toFixed(2));
    assert.equal(rows.find(row => row.key === 'TrueCombo')?.value, 'False');
    assert.equal(rows.find(row => row.key === 'TrueComboRecoveryTime')?.value, '0.73');
    assert.equal(rows.find(row => row.key === 'TrueComboStamina')?.value, '-17.00');
    const selected = rows.filter(row => row.key === key);
    const commands = selectedReviewCommands(rows, new Set(selected.map(row => row.id)));
    const applied = await apply(request({ commands, wipeDatabase: false }));
    assert.equal(applied.status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    assert.equal(commands.length, 1);
    const prefix = 'string ezconfig Character Parry ';
    assert(commands[0].startsWith(prefix));
    assert.deepEqual(JSON.parse(commands[0].slice(prefix.length)), { [key]: window.toFixed(2) });
  }
  const resetSaved = await save(request({ entries: { TrueCombo: false, TrueComboRecoveryTime: .73 } }) as never,
    { params: Promise.resolve({ path: ['Character', 'Parry'] }) });
  assert.equal(resetSaved.status, 200);
  const resetRows = reviewRows((await (await preview()).json()).commands);
  assert(!resetRows.some(row => row.key === key));
  assert(resetRows.some(row => row.key === 'TrueCombo' && row.value === 'False'));
  const resetCommands = selectedReviewCommands(resetRows, new Set(resetRows.map(row => row.id)));
  assert.equal((await apply(request({ commands: resetCommands, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...resetCommands]);
  console.log('PASS: independent detector zero/positive saves, review, selected dispatch; TrueCombo remains disabled and its parameters unchanged');
} finally {
  const target = resolve(root);
  assert(target.startsWith(tempParent + sep) && target.slice(tempParent.length + 1).startsWith('ezconfig-parry-detector-'));
  await rm(target, { recursive: true, force: true });
}
