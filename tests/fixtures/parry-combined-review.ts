import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { BASE_PARRY_CONFIG_OPTIONS } from '../../src/lib/config/baseParryConfigSchema';

const tempParent = resolve(tmpdir());
const root = await mkdtemp(join(tempParent, 'ezconfig-parry-combined-'));
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
  const request = (body: unknown) => new Request('http://localhost/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const base = Object.fromEntries(BASE_PARRY_CONFIG_OPTIONS.map((entry, index) => [entry.configKey, index / 10]));
  assert.equal(Object.keys(base).length, 10);
  const entries = { ...base, TrueCombo: true, TrueComboRecoveryTime: .73, TrueComboStamina: -17,
    ExperimentalParry: false, ExperimentalParryDuration: .27 };
  assert.equal((await save(request({ entries }) as never,
    { params: Promise.resolve({ path: ['Character', 'Parry'] }) })).status, 200);
  const rows = reviewRows((await (await preview()).json()).commands);
  for (const [key, value] of Object.entries(entries)) {
    assert.equal(rows.find(row => row.key === key)?.value,
      typeof value === 'boolean' ? (value ? 'True' : 'False') : value.toFixed(2));
  }
  const keys = new Set([...Object.keys(base), 'TrueCombo', 'TrueComboRecoveryTime', 'TrueComboStamina', 'ExperimentalParry']);
  const commands = selectedReviewCommands(rows, new Set(rows.filter(row => keys.has(row.key)).map(row => row.id)));
  assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], commands);
  const prefix = 'string ezconfig Character Parry ';
  assert.equal(commands.length, 1);
  assert(commands[0].startsWith(prefix));
  assert.deepEqual(JSON.parse(commands[0].slice(prefix.length)), Object.fromEntries(
    Object.entries(entries).filter(([key]) => keys.has(key)).map(([key, value]) =>
      [key, typeof value === 'boolean' ? (value ? 'True' : 'False') : value.toFixed(2)])));
  // Reset one base override while keeping its siblings and feature settings.
  const resetKey = BASE_PARRY_CONFIG_OPTIONS[0].configKey;
  const remaining = Object.fromEntries(Object.entries(entries).filter(([key]) => key !== resetKey));
  assert.equal((await save(request({ entries: remaining }) as never,
    { params: Promise.resolve({ path: ['Character', 'Parry'] }) })).status, 200);
  const resetRows = reviewRows((await (await preview()).json()).commands);
  assert(!resetRows.some(row => row.key === resetKey));
  assert.equal(resetRows.filter(row => Object.hasOwn(base, row.key)).length, 9);
  const resetCommands = selectedReviewCommands(resetRows, new Set(resetRows.map(row => row.id)));
  assert.equal((await apply(request({ commands: resetCommands, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...resetCommands]);
  console.log('PASS: all ten base keys coexist with TrueCombo and ExperimentalParry through save/review/selected apply; zero and reset/wipe preserved');
} finally {
  const target = resolve(root);
  assert(target.startsWith(tempParent + sep) && target.slice(tempParent.length + 1).startsWith('ezconfig-parry-combined-'));
  await rm(target, { recursive: true, force: true });
}
