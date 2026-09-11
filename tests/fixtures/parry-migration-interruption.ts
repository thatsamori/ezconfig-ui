import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const root = await fs.mkdtemp(join(tmpdir(), 'ezconfig-parry-crash-'));
const options = { databasesRoot: join(root, 'Databases'), presetsRoot: join(root, 'Presets'), notice: () => {} };
const stage = process.argv[2];
let enabled = true, failed = false;
const realRename = fs.rename, realOpen = fs.open;
mock.module('node:fs/promises', () => ({ ...fs,
  open: async (...args: Parameters<typeof fs.open>) => {
    if (enabled && stage === 'unwritable' && String(args[0]).includes('Parry.json.')) { failed = true; throw Object.assign(new Error('fixture denied write'), { code: 'EACCES' }); }
    return realOpen(...args);
  },
  rename: async (...args: Parameters<typeof fs.rename>) => {
    const target = String(args[1]);
    const point = target.endsWith('.backup.json') ? 'backup' : target.endsWith('Parry.json') ? 'destination' : target.endsWith('Combat.json') ? 'source' : target.endsWith('.complete.json') ? 'receipt' : '';
    const selected = stage === 'external-edit' ? 'after-destination' : stage;
    if (enabled && selected === `before-${point}`) { failed = true; throw new Error('fixture interruption'); }
    await realRename(...args);
    if (enabled && selected === `after-${point}`) { failed = true; throw new Error('fixture interruption'); }
  },
}));
try {
  const { migrateParryGeometry, PARRY_TRANSFORM_KEYS, PARRY_MIGRATION_BACKUP, PARRY_MIGRATION_RECEIPT } = await import('../../src/lib/migrations/parry-geometry');
  const data = { [PARRY_TRANSFORM_KEYS[0]]: { x: 0, y: -5, z: 10 }, CanJumpKick: false };
  const originals = JSON.stringify(data, null, 4);
  const directories = [join(options.databasesRoot, 'Character'), join(options.presetsRoot, 'User', 'one', 'Character'), join(options.presetsRoot, 'User', 'two', 'Character')];
  for (const directory of directories) { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(join(directory, 'Combat.json'), originals); }
  await assert.rejects(migrateParryGeometry(options));
  assert(failed, 'fixture must interrupt the requested real filesystem boundary');
  const backupPath = join(options.databasesRoot, PARRY_MIGRATION_BACKUP);
  const backupBefore = await fs.readFile(backupPath, 'utf8').catch(() => null);
  if (stage !== 'after-receipt') await assert.rejects(fs.stat(join(options.databasesRoot, PARRY_MIGRATION_RECEIPT)));
  enabled = false;
  if (stage === 'external-edit') {
    await fs.writeFile(join(directories[0], 'Combat.json'), '{"CanJumpKick":true}');
    await assert.rejects(migrateParryGeometry(options), /changed since backup/);
    assert.equal(await fs.readFile(join(directories[1], 'Combat.json'), 'utf8'), originals, 'do not partially resume the next preset');
    await fs.writeFile(join(directories[0], 'Combat.json'), originals);
  }
  await migrateParryGeometry(options);
  if (backupBefore !== null) assert.equal(await fs.readFile(backupPath, 'utf8'), backupBefore, 'recovery must not overwrite original backup');
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  assert.equal(backup.originals.length, 3);
  for (const original of backup.originals) assert.equal(original.combat, originals);
  for (const directory of directories) {
    assert.deepEqual(JSON.parse(await fs.readFile(join(directory, 'Combat.json'), 'utf8')), { CanJumpKick: false });
    assert.deepEqual(JSON.parse(await fs.readFile(join(directory, 'Parry.json'), 'utf8')), { [PARRY_TRANSFORM_KEYS[0]]: data[PARRY_TRANSFORM_KEYS[0]] });
  }
  assert.equal((await migrateParryGeometry(options)).status, 'already-complete');
} finally {
  const target = resolve(root);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-parry-crash-'));
  await fs.rm(target, { recursive: true, force: true });
}
