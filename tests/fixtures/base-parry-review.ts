// Real route handlers and review model, with isolated storage and only RCON mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const tempParent = resolve(tmpdir());
const root = await mkdtemp(join(tempParent, 'ezconfig-parry-review-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = [];
mock.module('../../src/lib/rcon/service', () => ({
  executeBatchCommands: async (commands: string[]) => { sent.push(commands); },
}));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { BASE_PARRY_CONFIG_OPTIONS } = await import('../../src/lib/config/baseParryConfigSchema');
  const baseEntries = Object.fromEntries(BASE_PARRY_CONFIG_OPTIONS.map((entry, index) =>
    [entry.configKey, (index + 1) / 10]));
  baseEntries.ParryUpTime = 0;
  baseEntries.ParryRecoveryTime = 0.31;
  baseEntries.HeldParryRecoveryTime = 0.62;
  baseEntries.MissParryRecoveryTime = 0;
  const entries = { ...baseEntries, ExperimentalParry: false, ExperimentalParryDuration: 0.07, TrueCombo: false, TrueComboRecoveryTime: 0.41 };
  const request = (body: unknown) => new Request('http://localhost/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const saved = await save(request({ entries }) as never, { params: Promise.resolve({ path: ['Character', 'Parry'] }) });
  assert.equal(saved.status, 200, JSON.stringify(await saved.json()));
  const response = await preview();
  assert.equal(response.status, 200);
  const body = await response.json();
  const rows = reviewRows(body.commands);
  assert.equal(rows.length, Object.keys(entries).length, 'all saved base and feature keys appear in review');
  assert(rows.every(row => row.database === 'Character' && row.category === 'Parry'));
  assert.equal(rows.find(row => row.key === 'ParryUpTime')?.value, '0.00');
  assert.equal(rows.find(row => row.key === 'ExperimentalParry')?.value, 'False');

  // Selecting just base values must not silently enable or dispatch a feature.
  const selectedRows = rows.filter(row => row.key in baseEntries);
  const selectedCommands = selectedReviewCommands(rows, new Set(selectedRows.map(row => row.id)));
  const selected = await apply(request({ commands: selectedCommands, wipeDatabase: false }));
  assert.equal(selected.status, 200);
  assert.deepEqual(sent, [selectedCommands]);
  const payload = (commands: string[]) => {
    assert.equal(commands.length, 1);
    const prefix = 'string ezconfig Character Parry ';
    assert(commands[0].startsWith(prefix));
    return JSON.parse(commands[0].slice(prefix.length));
  };
  const wireValues = (values: Record<string, number | boolean>) => Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === 'boolean' ? (value ? 'True' : 'False') : value.toFixed(2)]),
  );
  assert.deepEqual(payload(sent[0]), wireValues(baseEntries));

  const allCommands = selectedReviewCommands(rows, new Set(rows.map(row => row.id)));
  const all = await apply(request({ commands: allCommands, wipeDatabase: false }));
  assert.equal(all.status, 200);
  assert.deepEqual(payload(sent[1]), wireValues(entries), 'base rules coexist with stored, disabled feature settings');
  console.log(`PASS: ${Object.keys(baseEntries).length} base parry controls survive save/review/selected apply, zero and independent feature coexistence`);
} finally {
  const target = resolve(root);
  assert(target.startsWith(tempParent + sep) && target.slice(tempParent.length + 1).startsWith('ezconfig-parry-review-'));
  await rm(target, { recursive: true, force: true });
}
