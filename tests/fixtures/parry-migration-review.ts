import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { successfulProcessingFixture } from './acknowledged-transport';
import { categoryEntries } from './feature-review-harness';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-parry-review-'));
const databaseRoot = join(root, 'Databases');
process.env.DATABASES_PATH = databaseRoot;
process.env.PRESETS_PATH = join(root, 'Presets');
process.env.DATABASE_PATH = join(root, 'platform.db');
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
const ownershipPort = (probe.address() as { port: number }).port;
await new Promise<void>(resolve => probe.close(() => resolve()));
const automatic: string[][] = [];
let listenerConnections = 0;
mock.module('../../src/lib/rcon/sync-listener', () => ({
  connectSyncListener: async () => {
    listenerConnections++;
    let close!: () => void;
    const closed = new Promise<void>(resolve => { close = resolve; });
    return { closed, close: async () => close() };
  },
}));
mock.module('../../src/lib/rcon/service', () => ({
  executeAcknowledgedBatchAt: async (_target: unknown, commands: string[]) => { automatic.push(commands); return successfulProcessingFixture(commands); },
  executeAcknowledgedBatch: async () => assert.fail('nothing is applied over the self-hosted RCON path'),
}));
const environment = {
  NEXT_RUNTIME: 'nodejs', DATABASES_PATH: databaseRoot, PRESETS_PATH: process.env.PRESETS_PATH,
  RCON_AUTO_SYNC_ENABLED: 'true', RCON_AUTO_SYNC_OWNER_PORT: String(ownershipPort),
  RCON_HOST: '127.0.0.1', RCON_PORT: '17947', RCON_PASSWORD: 'isolated-placeholder',
};
const until = async (predicate: () => boolean) => {
  const end = Date.now() + 2000;
  while (!predicate()) { if (Date.now() > end) throw new Error('Startup did not produce an automatic snapshot'); await Bun.sleep(5); }
};
let stop: (() => Promise<void>) | undefined;
try {
  const { PARRY_TRANSFORM_KEYS } = await import('../../src/lib/migrations/parry-geometry');
  const entries = Object.fromEntries(PARRY_TRANSFORM_KEYS.map((key, index) => [key, { x: 0, y: index - 2, z: index + 1 }]));
  const character = join(databaseRoot, 'Character');
  await mkdir(character, { recursive: true });
  await writeFile(join(character, 'Combat.json'), JSON.stringify({ ...entries, CanJumpKick: true }));
  await writeFile(join(character, 'Parry.json'), JSON.stringify({ [PARRY_TRANSFORM_KEYS[0]]: { x: 0, y: 0, z: 0 }, TrueCombo: false, TrueComboStamina: 0 }));
  const { registerServerStartup } = await import('../../src/lib/server-startup');
  stop = (await import('../../src/lib/rcon/automatic-sync-bootstrap')).stopRegisteredAutomaticSync;
  await registerServerStartup(environment);
  await until(() => automatic.length === 1);
  assert.equal(listenerConnections, 1);
  assert.equal(automatic[0][0], 'string ezconfig WipeDatabases');
  const startupParry = categoryEntries(automatic[0], 'Character', 'Parry') ?? {}, startupCombat = categoryEntries(automatic[0], 'Character', 'Combat') ?? {};
  assert(PARRY_TRANSFORM_KEYS.every(key => key in startupParry && !(key in startupCombat)));
  assert.equal(startupParry[PARRY_TRANSFORM_KEYS[0]], 'X=0.00,Y=0.00,Z=0.00');
  assert.equal(startupCombat.CanJumpKick, 'True');
  if (process.env.PARRY_MIGRATION_CAPTURE) await writeFile(process.env.PARRY_MIGRATION_CAPTURE, JSON.stringify({
    boundary: 'Real startup migration and strict snapshot builder; external RCON transport mocked',
    originalCombat: { ...entries, CanJumpKick: true },
    originalParry: { [PARRY_TRANSFORM_KEYS[0]]: { x: 0, y: 0, z: 0 }, TrueCombo: false, TrueComboStamina: 0 },
    commands: automatic[0],
  }, null, 2));

  // The migrated storage as a Draft holds it, with no category, edited: it places and encodes under Parry.
  const { readCategory } = await import('../../src/lib/database/service');
  const { placeValues } = await import('../../src/lib/config/valuesDocument');
  const { commandBatch } = await import('../../src/lib/config/encodeValues');
  const migrated = { ...await readCategory('Character', 'Combat'), ...await readCategory('Character', 'Parry') };
  assert.deepEqual(migrated[PARRY_TRANSFORM_KEYS[0]], { x: 0, y: 0, z: 0 });
  const document = { Character: { ...migrated, [PARRY_TRANSFORM_KEYS[0]]: { x: -4, y: 0, z: 2 } } };
  const { values, dropped } = placeValues(document);
  assert.equal(dropped, 0);
  assert(PARRY_TRANSFORM_KEYS.every(key => key in values.character.Parry && !(key in (values.character.Combat ?? {}))));
  const batch = commandBatch(document);
  assert.equal(categoryEntries(batch, 'Character', 'Parry')?.[PARRY_TRANSFORM_KEYS[0]], 'X=-4.00,Y=0.00,Z=2.00');
  assert(PARRY_TRANSFORM_KEYS.every(key => !(key in (categoryEntries(batch, 'Character', 'Combat') ?? {}))));

  await stop();
  const badRoot = join(root, 'bad');
  await mkdir(join(badRoot, 'Character'), { recursive: true });
  await writeFile(join(badRoot, 'Character', 'Combat.json'), '{');
  const oldError = console.error;
  console.error = () => {};
  try { await assert.rejects(registerServerStartup({ ...environment, DATABASES_PATH: badRoot }), /invalid JSON/); }
  finally { console.error = oldError; }
  await Bun.sleep(30);
  assert.equal(listenerConnections, 1, 'failed startup opens no listener');
  assert.equal(automatic.length, 1, 'failed startup produces no extra snapshot or wipe');
  console.info('PASS: migrated storage -> real startup/runtime/snapshot -> wipe then canonical Parry; migrated values as an edited Draft encode under Parry; malformed startup never connects');
} finally {
  await stop?.();
  const target = resolve(root);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-parry-review-'));
  await rm(target, { recursive: true, force: true });
}
