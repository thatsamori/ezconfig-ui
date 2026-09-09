// Ticket 04: real store/persistence/review/apply, with only RCON mocked.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-weapon-roster-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = [];
const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({
  executeBatchCommands: async (commands: string[]) => { sent.push(commands); },
}));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands, weapons } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  const { lookupDefault } = await import('../../src/lib/config/defaults');
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert(url.startsWith('/api/config/'));
    return save(new Request('http://localhost' + url, init) as never, {
      params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }),
    });
  }) as unknown as typeof fetch;
  const request = (body: unknown) => new Request('http://localhost/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const store = useConfigStore.getState();
  async function readRows() {
    await flushConfigWrites();
    const response = await preview(); assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  async function applyRows(rows: ReturnType<typeof reviewRows>, names?: string[], wipe = false) {
    const selected = rows.filter(row => !names || names.includes(row.database));
    const commands = selectedReviewCommands(rows, new Set(selected.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: wipe }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], wipe ? ['string ezconfig WipeDatabases', ...commands] : commands);
    return sent[sent.length - 1];
  }
  const values = {
    MeatCleaver: { Strike: { Windup: .83 }, General: { CanBlock: false } },
    Polehammer: { Strike: { Windup: .91 }, General: { CanBlock: false } },
    Greatsword: { Strike: { Windup: .73 } },
  };
  assert.equal((await readRows()).length, 0);
  for (const [weapon, categories] of Object.entries(values)) {
    assert(weapons.some(name => name === weapon));
    for (const [category, entries] of Object.entries(categories)) {
      for (const [key, value] of Object.entries(entries)) {
        assert(lookupDefault(weapon, category, key).defaultValue !== undefined, weapon + '/' + category + '/' + key + ' default metadata');
        store.setValue(weapon, category, key, value);
      }
    }
  }
  const rows = await readRows(); assert.equal(rows.length, 5);
  for (const [weapon, categories] of Object.entries(values)) {
    const commands = await applyRows(rows, [weapon]);
    assert.equal(commands.length, Object.keys(categories).length);
    assert(commands.every(command => command.startsWith('string ezconfig ' + weapon + ' ')));
    for (const [category, entries] of Object.entries(categories)) {
      const prefix = 'string ezconfig ' + weapon + ' ' + category + ' ';
      const command = commands.find(item => item.startsWith(prefix)); assert(command);
      assert.deepEqual(JSON.parse(command.slice(prefix.length)), Object.fromEntries(Object.entries(entries).map(([key, value]) =>
        [key, typeof value === 'number' ? value.toFixed(2) : value ? 'True' : 'False'])));
    }
  }
  const initialCommands = await applyRows(rows, undefined, true);
  store.setValue('MeatCleaver', 'Strike', 'Windup', 1.07);
  const updates = await readRows();
  assert.equal(updates.find(row => row.database === 'MeatCleaver' && row.key === 'Windup')!.value, '1.07');
  assert.equal(updates.find(row => row.database === 'Polehammer' && row.key === 'Windup')!.value, '0.91');
  assert.equal(updates.find(row => row.database === 'Greatsword')!.value, '0.73');
  const updateCommands = await applyRows(updates, ['MeatCleaver']);
  const updatedStrike = updateCommands.find(command => command.startsWith('string ezconfig MeatCleaver Strike '));
  assert(updatedStrike);
  assert.deepEqual(JSON.parse(updatedStrike.slice('string ezconfig MeatCleaver Strike '.length)), { Windup: '1.07' });
  store.removeValue('MeatCleaver', 'General', 'CanBlock');
  const removed = await readRows();
  assert(!removed.some(row => row.database === 'MeatCleaver' && row.category === 'General'));
  assert(removed.some(row => row.database === 'Polehammer' && row.key === 'CanBlock' && row.value === 'False'));
  await applyRows(removed, undefined, true);
  if (process.env.EZCONFIG_CAPTURE_ROSTER_COMMANDS === '1') {
    const directory = resolve('.scratch/weapon-reliability-ui');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'ticket04-captured-rcon.json'), JSON.stringify({
      source: 'Real store -> temporary persistence -> review -> selected apply -> captured RCON',
      initialCommands, updateCommands, values,
    }, null, 2) + '\n');
  }
  console.log('PASS: both roster entries and Greatsword persist, review and apply independently; false, partial removal and wipe ordering preserved');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-weapon-roster-'));
  await rm(target, { recursive: true, force: true });
}
