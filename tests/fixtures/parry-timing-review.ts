// Run from tests/fixtures in the UI repo after ticket06 schema registration.
// Real save/review/selected apply; isolated storage and captured RCON transport.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const tempParent = resolve(tmpdir());
const root = await mkdtemp(join(tempParent, 'ezconfig-parry-timing-'));
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
  const names = ['EasyParryDuration', 'NonHeldParryExtensionAndRiposteWindowExtra', 'RiposteWindowBase'];
  for (let zeroIndex = 0; zeroIndex < names.length; zeroIndex++) {
    const base = Object.fromEntries(names.map((key, index) => [key, index === zeroIndex ? 0 : (index + 1) / 10]));
    const entries = { ...base, ExperimentalParry: false, ExperimentalParryDuration: 0.47 };
    const saved = await save(request({ entries }) as never, { params: Promise.resolve({ path: ['Character', 'Parry'] }) });
    assert.equal(saved.status, 200, JSON.stringify(await saved.json()));
    const response = await preview();
    assert.equal(response.status, 200);
    const rows = reviewRows((await response.json()).commands);
    for (const [key, value] of Object.entries(base)) {
      assert.equal(rows.find(row => row.key === key)?.value, value.toFixed(2));
    }
    // Select only the current zero key: siblings and features must not leak.
    const selected = rows.filter(row => row.key === names[zeroIndex]);
    const commands = selectedReviewCommands(rows, new Set(selected.map(row => row.id)));
    const applied = await apply(request({ commands, wipeDatabase: false }));
    assert.equal(applied.status, 200);
    assert.deepEqual(sent[sent.length - 1], commands);
    assert.equal(commands.length, 1);
    const prefix = 'string ezconfig Character Parry ';
    assert(commands[0].startsWith(prefix));
    assert.deepEqual(JSON.parse(commands[0].slice(prefix.length)), { [names[zeroIndex]]: '0.00' });
  }
  console.log('PASS: each timing key saves independently, appears in review, and dispatches selected zero without sibling or feature values');
} finally {
  const target = resolve(root);
  assert(target.startsWith(tempParent + sep) && target.slice(tempParent.length + 1).startsWith('ezconfig-parry-timing-'));
  await rm(target, { recursive: true, force: true });
}
