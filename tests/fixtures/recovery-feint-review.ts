import { successfulProcessingFixture } from './acknowledged-transport';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-recovery-feint-'));
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
  const prefix = 'string ezconfig Character Recovery ';
  async function rowsFor(entries: Record<string, number>) {
    const result = await save(request({ entries }) as never, { params: Promise.resolve({ path: ['Character', 'Recovery'] }) });
    assert.equal(result.status, 200);
    const response = await preview(); assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  async function select(rows: ReturnType<typeof reviewRows>, keys: string[]) {
    const commands = selectedReviewCommands(rows, new Set(rows.filter(row => keys.includes(row.key)).map(row => row.id)));
    const result = await apply(request({ commands, wipeDatabase: false }));
    assert.equal(result.status, 200); assert.deepEqual(sent[sent.length - 1], commands);
    assert.equal(commands.length, 1); assert(commands[0].startsWith(prefix));
    return JSON.parse(commands[0].slice(prefix.length));
  }
  for (const key of ['ExtraStrikeLockout', 'ExtraStabLockout']) {
    for (const value of [0, -.25, .8]) {
      const rows = await rowsFor({ [key]: value });
      assert.equal(rows.length, 1); assert.equal(rows[0].key, key);
      assert.deepEqual(await select(rows, [key]), { [key]: value.toFixed(2) });
    }
  }
  const combined = await rowsFor({ ExtraStrikeLockout: .8, ExtraStabLockout: -.2, WorldRecoveryTime: .3, WorldMissStaminaFactor: 2, ParriedRecoveryTimeMin: 0 });
  assert.equal(combined.length, 5);
  assert.deepEqual(await select(combined, ['ExtraStabLockout']), { ExtraStabLockout: '-0.20' });
  assert.deepEqual(await select(combined, ['ExtraStrikeLockout', 'ExtraStabLockout']), { ExtraStrikeLockout: '0.80', ExtraStabLockout: '-0.20' });
  const reset = await rowsFor({ ExtraStabLockout: -.2, WorldRecoveryTime: .3 });
  assert(!reset.some(row => row.key === 'ExtraStrikeLockout'));
  assert(reset.some(row => row.key === 'WorldRecoveryTime'));
  const commands = selectedReviewCommands(reset, new Set(reset.map(row => row.id)));
  assert.equal((await apply(request({ commands, wipeDatabase: true }))).status, 200);
  assert.deepEqual(sent[sent.length - 1], ['string ezconfig WipeDatabases', ...commands]);
  console.log('PASS: independent feint extras, signed values, selected transport, coexistence and partial Reset');
} finally {
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-recovery-feint-'));
  await rm(target, { recursive: true, force: true });
}
