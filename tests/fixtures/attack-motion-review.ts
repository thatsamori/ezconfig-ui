// Isolated process: exercise the real save, preview, review selection and apply
// handlers without touching user data or opening a connection to a game server.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const tempParent = resolve(tmpdir());
const root = await mkdtemp(join(tempParent, 'ezconfig-attack-review-'));
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
  const { ATTACK_MOTION_CONFIG_OPTIONS } = await import('../../src/lib/config/attackMotionConfigSchema');
  const entries = Object.fromEntries(ATTACK_MOTION_CONFIG_OPTIONS.map(entry =>
    [entry.configKey, entry.dataType === 'Bool' ? false : 0.1234]));
  entries.StrikeFeintWindow = 0;
  const request = (body: unknown) => new Request('http://localhost/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const saved = await save(request({ entries }) as never, { params: Promise.resolve({ path: ['Character', 'AttackMotion'] }) });
  assert.equal(saved.status, 200, JSON.stringify(await saved.json()));
  const response = await preview();
  assert.equal(response.status, 200);
  const body = await response.json();
  const rows = reviewRows(body.commands);
  assert.equal(rows.length, 34, 'saved AttackMotion keys must appear in review');
  assert(rows.every(row => row.database === 'Character' && row.category === 'AttackMotion'));
  assert.equal(rows.find(row => row.key === 'StrikeFeintWindow')?.value, '0.00');
  assert.equal(rows.find(row => row.key === 'DisableStrikeEndReleaseGlances')?.value, 'False');
  const commands = selectedReviewCommands(rows, new Set(rows.map(row => row.id)));
  const applied = await apply(request({ commands, wipeDatabase: false }));
  assert.equal(applied.status, 200);
  assert.deepEqual(sent, [commands]);
  assert(sent[0][0].startsWith('string ezconfig Character AttackMotion '));
  console.log('PASS: 34 saved AttackMotion keys reach preview, review selection and mocked RCON dispatch, including 0 and false');
} finally {
  const target = resolve(root);
  assert(target.startsWith(tempParent + sep) && target.slice(tempParent.length + 1).startsWith('ezconfig-attack-review-'));
  await rm(target, { recursive: true, force: true });
}
