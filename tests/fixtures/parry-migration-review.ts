import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { successfulProcessingFixture } from './acknowledged-transport';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-parry-review-'));
const databaseRoot = join(root, 'Databases');
process.env.DATABASES_PATH = databaseRoot;
process.env.PRESETS_PATH = join(root, 'Presets');
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
const ownershipPort = (probe.address() as { port: number }).port;
await new Promise<void>(resolve => probe.close(() => resolve()));
const automatic: string[][] = [], manual: string[][] = [];
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
  executeAcknowledgedBatch: async (commands: string[]) => { manual.push(commands); return successfulProcessingFixture(commands); },
}));
const environment = {
  NEXT_RUNTIME: 'nodejs', DATABASES_PATH: databaseRoot, PRESETS_PATH: process.env.PRESETS_PATH,
  RCON_AUTO_SYNC_ENABLED: 'true', RCON_AUTO_SYNC_OWNER_PORT: String(ownershipPort),
  RCON_HOST: '127.0.0.1', RCON_PORT: '17947', RCON_PASSWORD: 'isolated-placeholder',
};
const request = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const startupRows = reviewRows(automatic[0].slice(1));
  const transformRows = startupRows.filter(row => PARRY_TRANSFORM_KEYS.includes(row.key as typeof PARRY_TRANSFORM_KEYS[number]));
  assert.equal(transformRows.length, 6);
  assert(transformRows.every(row => row.category === 'Parry'));
  assert.equal(transformRows.find(row => row.key === PARRY_TRANSFORM_KEYS[0])?.value, 'X=0.00,Y=0.00,Z=0.00');
  assert(startupRows.some(row => row.category === 'Combat' && row.key === 'CanJumpKick'));
  if (process.env.PARRY_MIGRATION_CAPTURE) await writeFile(process.env.PARRY_MIGRATION_CAPTURE, JSON.stringify({
    boundary: 'Real startup migration and strict snapshot builder; external RCON transport mocked',
    originalCombat: { ...entries, CanJumpKick: true },
    originalParry: { [PARRY_TRANSFORM_KEYS[0]]: { x: 0, y: 0, z: 0 }, TrueCombo: false, TrueComboStamina: 0 },
    commands: automatic[0],
  }, null, 2));

  const { PATCH: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { GET: overrides } = await import('../../src/app/api/databases/overrides/route');
  const saved = await overrides();
  assert.equal(saved.status, 200);
  const values = (await saved.json()).values;
  assert.deepEqual(values.character.Parry[PARRY_TRANSFORM_KEYS[0]], { x: 0, y: 0, z: 0 });
  const updated = { x: -4, y: 0, z: 2 };
  const response = await save(new Request('http://localhost/api', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: { [PARRY_TRANSFORM_KEYS[0]]: updated } }) }) as never, { params: Promise.resolve({ path: ['Character', 'Parry'] }) });
  assert.equal(response.status, 200);
  const reviewed = await preview();
  assert.equal(reviewed.status, 200);
  const rows = reviewRows((await reviewed.json()).commands);
  const selected = rows.filter(row => PARRY_TRANSFORM_KEYS.includes(row.key as typeof PARRY_TRANSFORM_KEYS[number]));
  assert.equal(selected.length, 6);
  assert(selected.every(row => row.category === 'Parry'));
  const commands = selectedReviewCommands(rows, new Set(selected.map(row => row.id)));
  assert.equal((await apply(request({ commands, wipeDatabase: false }))).status, 200);
  assert.deepEqual(manual, [commands]);
  assert(manual[0].every(command => command.startsWith('string ezconfig Character Parry ')));
  assert.deepEqual(JSON.parse(await readFile(join(character, 'Parry.json'), 'utf8'))[PARRY_TRANSFORM_KEYS[0]], updated);

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
  console.info('PASS: migrated storage -> real startup/runtime/snapshot -> wipe then canonical Parry; real saved read/edit/review/selected apply; malformed startup never connects');
} finally {
  await stop?.();
  const target = resolve(root);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-parry-review-'));
  await rm(target, { recursive: true, force: true });
}
