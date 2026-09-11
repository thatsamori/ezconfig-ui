import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { migrateParryGeometry, PARRY_TRANSFORM_KEYS, PARRY_MIGRATION_BACKUP, PARRY_MIGRATION_RECEIPT } from '../src/lib/migrations/parry-geometry';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { parrySections } from '../src/components/console/parry-sections';
import { DataType } from '../src/lib/config/types';

async function fixture(run: (options: { databasesRoot: string; presetsRoot: string; notice: (message: string) => void }, root: string, notices: string[]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ezconfig-parry-migration-'));
  const notices: string[] = [];
  try { await run({ databasesRoot: join(root, 'Databases'), presetsRoot: join(root, 'Presets'), notice: message => notices.push(message) }, root, notices); }
  finally {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1)?.startsWith('ezconfig-parry-migration-')) throw new Error('Unsafe fixture cleanup');
    await rm(target, { recursive: true, force: true });
  }
}
async function put(directory: string, category: string, data: unknown) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${category}.json`), JSON.stringify(data, null, 2));
}
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const transforms = Object.fromEntries(PARRY_TRANSFORM_KEYS.map((key, index) => [key, { x: index - 3, y: 0, z: index + 0.25 }]));

test('no legacy data creates a verified receipt once; repeated startup writes nothing', async () => fixture(async options => {
  await put(join(options.databasesRoot, 'Character'), 'Combat', { CanJumpKick: false });
  await put(join(options.databasesRoot, 'Character'), 'Parry', { ParryUpTime: 0.3 });
  const first = await migrateParryGeometry(options);
  expect(first.status).toBe('unchanged');
  const before = await stat(first.receiptPath);
  expect((await migrateParryGeometry(options)).status).toBe('already-complete');
  expect((await stat(first.receiptPath)).mtimeMs).toBe(before.mtimeMs);
  expect((await json(first.backupPath)).originals).toEqual([]);
}));

test('all six transforms and multiple presets move without changing other categories, weapons, manifests or static presets', async () => fixture(async (options, _root, notices) => {
  const character = join(options.databasesRoot, 'Character');
  const user = join(options.presetsRoot, 'User');
  for (const directory of [character, join(user, 'one', 'Character'), join(user, 'two', 'Character')]) {
    await put(directory, 'Combat', { ...transforms, CanJumpKick: false });
    await put(directory, 'Parry', { ExperimentalParry: false, TrueComboStamina: 0 });
  }
  await put(join(user, 'one'), 'manifest', { title: 'One', description: 'Retain me' });
  await put(join(options.databasesRoot, 'Weapon', 'Greatsword'), 'Strike', { Damage: [30, 40] });
  await put(join(options.presetsRoot, 'Static', 'example', 'Character'), 'Combat', transforms);
  const original = await readFile(join(character, 'Combat.json'), 'utf8');
  const result = await migrateParryGeometry(options);
  expect(result.status).toBe('migrated');
  expect(result.changes).toHaveLength(3);
  for (const directory of [character, join(user, 'one', 'Character'), join(user, 'two', 'Character')]) {
    expect(await json(join(directory, 'Combat.json'))).toEqual({ CanJumpKick: false });
    expect(await json(join(directory, 'Parry.json'))).toEqual({ ExperimentalParry: false, TrueComboStamina: 0, ...transforms });
  }
  expect((await json(result.backupPath)).originals.find((entry: { preset: string | null }) => entry.preset === null).combat).toBe(original);
  expect(await json(join(user, 'one', 'manifest.json'))).toEqual({ title: 'One', description: 'Retain me' });
  expect(await json(join(options.databasesRoot, 'Weapon', 'Greatsword', 'Strike.json'))).toEqual({ Damage: [30, 40] });
  expect(await json(join(options.presetsRoot, 'Static', 'example', 'Character', 'Combat.json'))).toEqual(transforms);
  expect(notices).toHaveLength(3);
}));

test('present canonical zero vectors win, with conflict notice and exact original backup', async () => fixture(async (options, _root, notices) => {
  const directory = join(options.databasesRoot, 'Character');
  const canonical = Object.fromEntries(PARRY_TRANSFORM_KEYS.map(key => [key, { x: 0, y: 0, z: 0 }]));
  await put(directory, 'Combat', transforms);
  await put(directory, 'Parry', canonical);
  const before = await readFile(join(directory, 'Parry.json'), 'utf8');
  const result = await migrateParryGeometry(options);
  expect(await json(join(directory, 'Parry.json'))).toEqual(canonical);
  expect(await json(join(directory, 'Combat.json'))).toEqual({});
  expect(result.changes[0].conflicts).toEqual([...PARRY_TRANSFORM_KEYS]);
  expect((await json(result.backupPath)).originals[0].parry).toBe(before);
  expect(notices[0]).toContain('Parry wins 6 conflict(s)');
  expect(notices[0]).toContain(PARRY_TRANSFORM_KEYS[0]);
}));

test('invalid falsy canonical values block startup rather than falling back to legacy values', async () => fixture(async options => {
  const directory = join(options.databasesRoot, 'Character');
  await put(directory, 'Combat', transforms);
  for (const value of [0, false, null, '', { x: 0, y: 1 }, { x: '0', y: 0, z: 0 }]) {
    const canonical = { [PARRY_TRANSFORM_KEYS[0]]: value };
    await put(directory, 'Parry', canonical);
    await expect(migrateParryGeometry(options)).rejects.toThrow('expected Vector');
    expect(await json(join(directory, 'Combat.json'))).toEqual(transforms);
    expect(await json(join(directory, 'Parry.json'))).toEqual(canonical);
  }
}));

test('the entire installation is validated before mutation, including malformed later presets and no-legacy files', async () => fixture(async options => {
  const directory = join(options.databasesRoot, 'Character');
  const preset = join(options.presetsRoot, 'User', 'last', 'Character');
  await put(directory, 'Combat', transforms);
  await mkdir(preset, { recursive: true });
  for (const malformed of ['{', '[]', 'null', '{"Unrelated":1e999}']) {
    await writeFile(join(preset, 'Parry.json'), malformed);
    await expect(migrateParryGeometry(options)).rejects.toThrow();
    expect(await json(join(directory, 'Combat.json'))).toEqual(transforms);
    expect(await readdir(options.databasesRoot)).toEqual(['Character']);
  }
}));

test('concurrent initialization has a single immutable backup and one conversion', async () => fixture(async options => {
  await put(join(options.databasesRoot, 'Character'), 'Combat', transforms);
  const results = await Promise.all(Array.from({ length: 6 }, () => migrateParryGeometry(options)));
  expect(results.filter(result => result.status === 'migrated')).toHaveLength(1);
  expect(results.filter(result => result.status === 'already-complete')).toHaveLength(5);
  expect((await json(results[0].backupPath)).originals).toHaveLength(1);
}));

test('completed migration does not become an ongoing converter for later legacy imports', async () => fixture(async options => {
  await migrateParryGeometry(options);
  const directory = join(options.presetsRoot, 'User', 'late-import', 'Character');
  await put(directory, 'Combat', transforms);
  expect((await migrateParryGeometry(options)).status).toBe('already-complete');
  expect(await json(join(directory, 'Combat.json'))).toEqual(transforms);
  expect(await readdir(directory)).toEqual(['Combat.json']);
}));

test('storage roots and backup digest bind completion to the entire original plan', async () => fixture(async options => {
  await put(join(options.databasesRoot, 'Character'), 'Combat', transforms);
  await migrateParryGeometry(options);
  await expect(migrateParryGeometry({ ...options, presetsRoot: join(options.presetsRoot, 'other') })).rejects.toThrow('storage roots');
  const backup = join(options.databasesRoot, PARRY_MIGRATION_BACKUP);
  await writeFile(backup, (await readFile(backup, 'utf8')) + '\n');
  await expect(migrateParryGeometry(options)).rejects.toThrow('does not match backup');
  expect(await json(join(options.databasesRoot, PARRY_MIGRATION_RECEIPT))).toHaveProperty('completedAt');
}));

for (const stage of ['before-backup', 'before-destination', 'after-destination', 'before-source', 'after-source', 'before-receipt', 'after-receipt', 'external-edit', 'unwritable']) {
  test(`interruption recovery and immutable originals: ${stage}`, () => {
    const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/parry-migration-interruption.ts', stage], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
    expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
  });
}

test('real startup is gated before sync, including disabled sync, builds, repeated registration and failure', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/parry-migration-startup.ts'], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('canonical saved read/edit/review/apply and real startup snapshot preserve migrated values', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/parry-migration-review.ts'], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('Parry sections retain geometry types, feature dependencies and every key exactly once', () => {
  const sections = parrySections(CHARACTER_CONFIG_OPTIONS.Parry);
  expect(sections.map(section => section.title)).toEqual(['Timing and recovery', 'Angles and geometry', 'Features']);
  const geometry = sections[1].entries;
  for (const key of PARRY_TRANSFORM_KEYS) {
    expect(CHARACTER_CONFIG_OPTIONS.Combat.some(entry => entry.configKey === key)).toBe(false);
    expect(geometry.find(entry => entry.configKey === key)?.dataType).toBe(DataType.Vector);
  }
  expect(geometry.find(entry => entry.configKey === 'MaxParryAngle')).toBeDefined();
  expect(sections[0].entries.find(entry => entry.configKey === 'ParryUpTime')).toBeDefined();
  expect(sections[2].entries.find(entry => entry.configKey === 'TrueComboStamina')?.gatedBy).toBe('TrueCombo');
  expect(sections.flatMap(section => section.entries)).toHaveLength(CHARACTER_CONFIG_OPTIONS.Parry.length);
});
