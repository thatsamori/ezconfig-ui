// Final integrated contract: real handlers and temporary persistence; only transport is mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-recovery-combined-'));
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
  const recoveryPrefix = 'string ezconfig Character Recovery ';
  async function saveCategory(category: string, entries: Record<string, number | boolean>) {
    const response = await save(request({ entries }) as never, {
      params: Promise.resolve({ path: ['Character', category] }),
    });
    assert.equal(response.status, 200, JSON.stringify(await response.json()));
  }
  async function readRows() {
    const response = await preview(); assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  async function selectedRecovery(rows: ReturnType<typeof reviewRows>, keys: string[]) {
    const commands = selectedReviewCommands(rows, new Set(rows
      .filter(row => row.category === 'Recovery' && keys.includes(row.key)).map(row => row.id)));
    const response = await apply(request({ commands, wipeDatabase: false }));
    assert.equal(response.status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    assert.equal(commands.length, 1);
    assert(commands[0].startsWith(recoveryPrefix));
    return JSON.parse(commands[0].slice(recoveryPrefix.length));
  }
  const values = {
    WorldRecoveryTime: 0,
    WorldMissStaminaFactor: -1,
    ParriedRecoveryTimeOffset: -.05,
    ParriedRecoveryTimeMin: .9,
    ParriedRecoveryTimeMax: .2,
    ExtraStrikeLockout: 0,
    ExtraStabLockout: -.25,
  };
  const formatted = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.toFixed(2)]));
  await saveCategory('Damage', { TeamHitRecovery: true, TeamHitRecoveryExtraTime: 1.5 });
  assert(!(await readRows()).some(row => row.category === 'Recovery'));
  await saveCategory('Recovery', values);
  const rows = await readRows();
  assert.equal(rows.length, 9);
  const recovery = rows.filter(row => row.category === 'Recovery');
  assert.equal(recovery.length, 7);
  assert(recovery.every(row => row.database === 'Character'));
  assert.deepEqual(Object.fromEntries(recovery.map(row => [row.key, row.value])), formatted);
  assert.deepEqual(await selectedRecovery(rows, Object.keys(values)), formatted);

  // A selected limit neither pulls in its sibling nor sorts the saved reversed pair.
  assert.deepEqual(await selectedRecovery(rows, ['ParriedRecoveryTimeMin']), { ParriedRecoveryTimeMin: '0.90' });
  assert.deepEqual(await selectedRecovery(rows, ['ParriedRecoveryTimeMax']), { ParriedRecoveryTimeMax: '0.20' });
  assert.deepEqual(await selectedRecovery(rows, ['WorldRecoveryTime', 'WorldMissStaminaFactor', 'ExtraStabLockout']), {
    WorldRecoveryTime: '0.00', WorldMissStaminaFactor: '-1.00', ExtraStabLockout: '-0.25',
  }, 'unselected Recovery siblings and adjacent TeamHit feature keys must not reach transport');

  // Partial Reset preserves an independently saved maximum, zero and signed values.
  await saveCategory('Recovery', { WorldRecoveryTime: .8, ParriedRecoveryTimeMax: 0, ExtraStabLockout: -.25 });
  const resetRows = await readRows();
  assert.deepEqual(Object.fromEntries(resetRows.filter(row => row.category === 'Recovery').map(row => [row.key, row.value])), {
    WorldRecoveryTime: '0.80', ParriedRecoveryTimeMax: '0.00', ExtraStabLockout: '-0.25',
  });
  assert.equal(resetRows.filter(row => row.category === 'Damage').length, 2);
  const remaining = selectedReviewCommands(resetRows, new Set(resetRows.map(row => row.id)));
  assert.equal((await apply(request({ commands: remaining, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...remaining]);

  await saveCategory('Recovery', {});
  const cleared = await readRows();
  assert.equal(cleared.length, 2);
  assert(cleared.every(row => row.category === 'Damage'));
  const adjacent = selectedReviewCommands(cleared, new Set(cleared.map(row => row.id)));
  assert.equal((await apply(request({ commands: adjacent, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...adjacent]);
  assert(sent[sent.length - 1].every(command => !command.startsWith(recoveryPrefix)));
  console.log('PASS: seven combined Recovery keys, native signed/zero values, independent limits, selective transport and reset/wipe coexistence');
} finally {
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-recovery-combined-'));
  await rm(target, { recursive: true, force: true });
}
