import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { successfulProcessingFixture } from './acknowledged-transport';
import { createServer } from 'node:net';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-geometry-combined-'));
process.env.DATABASES_PATH = join(root, 'Databases');
process.env.PRESETS_PATH = join(root, 'Presets');
const sent: string[][] = [];
const automatic: string[][] = [];
mock.module('../../src/lib/rcon/service', () => ({ executeAcknowledgedBatchAt: async (_target: unknown, commands: string[]) => { automatic.push([...commands]); return successfulProcessingFixture(commands); }, executeAcknowledgedBatch: async (commands: string[]) => { sent.push([...commands]); return successfulProcessingFixture(commands); } }));
mock.module('../../src/lib/rcon/sync-listener', () => ({ connectSyncListener: async () => { let close!: () => void; const closed = new Promise<void>(resolve => { close = resolve; }); return { closed, close: async () => close() }; } }));
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
const ownershipPort = (probe.address() as { port: number }).port;
await new Promise<void>(resolve => probe.close(() => resolve()));
let stop: (() => Promise<void>) | undefined;
const originalFetch = globalThis.fetch;
const request = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
try {
  const { PARRY_TRANSFORM_KEYS } = await import('../../src/lib/migrations/parry-geometry');
  const { registerServerStartup } = await import('../../src/lib/server-startup');
  const character = join(process.env.DATABASES_PATH, 'Character');
  await mkdir(character, { recursive: true });
  // Representative valid legacy transform payloads for category/lifecycle proof.
  const transforms = Object.fromEntries(PARRY_TRANSFORM_KEYS.map(key => [key, key.endsWith('Scale') ? { x: 1, y: 1, z: 1 } : { x: 0, y: 0, z: 0 }]));
  const parry: Record<string, unknown> = { ForwardParryLength: 50, ForwardParryHalfWidth: 100, ParryUpTime: 2, TrueCombo: false, ExperimentalParry: false, [PARRY_TRANSFORM_KEYS[0]]: { x: 0, y: 0, z: 0 } };
  const movement: Record<string, number> = { EllipseBubbleRadius: 220, EllipseBubbleLength: 200, EllipseBubbleMaxHeightDiff: 150, MaxWalkSpeedCrouched: 80, MaxWalkSpeedCrouchedWithRatPerk: 160 };
  await writeFile(join(character, 'Combat.json'), JSON.stringify({ ...transforms, CanJumpKick: true }));
  await writeFile(join(character, 'Parry.json'), JSON.stringify(parry));
  await writeFile(join(character, 'Movement.json'), JSON.stringify(movement));
  await writeFile(join(character, 'DebugTools.json'), JSON.stringify({ AllowVisualizeBlockCollider: false }));
  stop = (await import('../../src/lib/rcon/automatic-sync-bootstrap')).stopRegisteredAutomaticSync;
  await registerServerStartup({ NEXT_RUNTIME: 'nodejs', RCON_AUTO_SYNC_ENABLED: 'true', DATABASES_PATH: process.env.DATABASES_PATH, PRESETS_PATH: process.env.PRESETS_PATH, RCON_HOST: '127.0.0.1', RCON_PORT: '17947', RCON_PASSWORD: 'isolated-placeholder', RCON_AUTO_SYNC_OWNER_PORT: String(ownershipPort) });
  const deadline = Date.now() + 2000;
  while (!automatic.length) { assert(Date.now() < deadline); await Bun.sleep(5); }
  assert.equal(automatic.length, 1);
  assert.equal(automatic[0][0], 'string ezconfig WipeDatabases');
  assert.deepEqual(JSON.parse(await readFile(join(character, 'Combat.json'), 'utf8')), { CanJumpKick: true });
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  globalThis.fetch = (async (url: string, init: RequestInit) => save(new Request('http://localhost' + url, init) as never, { params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }) })) as unknown as typeof fetch;
  const captures: { name: string; commands: string[] }[] = [];
  async function capture(name: string, selected?: string[]) {
    await flushConfigWrites();
    const response = await preview(); assert.equal(response.status, 200);
    const rows = reviewRows((await response.json()).commands);
    const keys = rows.filter(row => !selected || selected.includes(row.key));
    const commands = selectedReviewCommands(rows, new Set(keys.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: !selected }))).status, 200);
    captures.push({ name, commands: sent.at(-1)! });
    return rows;
  }
  const rows = await capture('migrated-all');
  const contents = (commands: string[]) => reviewRows(commands.slice(1)).map(row => `${row.category}/${row.key}/${row.value}`).sort();
  assert.deepEqual(contents(captures[0].commands), contents(automatic[0]), 'manual saved review and real migrated startup snapshot agree regardless of key order');
  captures.unshift({ name: 'automatic-migrated-startup', commands: automatic[0] });
  assert.equal(rows.filter(row => PARRY_TRANSFORM_KEYS.includes(row.key as never) && row.category === 'Parry').length, 6);
  const geometry = ['ForwardParryLength', 'ForwardParryHalfWidth', 'EllipseBubbleRadius', 'EllipseBubbleLength', 'EllipseBubbleMaxHeightDiff'];
  assert.equal(rows.filter(row => geometry.includes(row.key)).length, 5);
  // Load the actual canonical saved state before exercising the store's edit path.
  const store = useConfigStore.getState();
  for (const [key, value] of Object.entries({ ...transforms, ...parry })) store.setValue('Character', 'Parry', key, value as never);
  for (const [key, value] of Object.entries(movement)) store.setValue('Character', 'Movement', key, value);
  store.setValue('Character', 'Parry', 'ForwardParryLength', 0);
  store.setValue('Character', 'Parry', 'ForwardParryHalfWidth', 0);
  store.setValue('Character', 'Movement', 'EllipseBubbleRadius', 60);
  store.setValue('Character', 'Movement', 'EllipseBubbleLength', 0);
  store.setValue('Character', 'Movement', 'EllipseBubbleMaxHeightDiff', 0);
  await capture('selected-all-five-update', geometry);
  await capture('updated-all');
  store.removeValue('Character', 'Parry', 'ForwardParryHalfWidth');
  store.removeValue('Character', 'Movement', 'EllipseBubbleLength');
  await capture('remove-width-and-length');
  store.setValue('Character', 'Parry', 'ForwardParryHalfWidth', 100);
  store.setValue('Character', 'Parry', 'ForwardParryLength', 50);
  for (const [key, value] of Object.entries(movement)) store.setValue('Character', 'Movement', key, value);
  await capture('reapply-all');
  store.setValue('Character', 'Movement', 'EllipseBubbleRadius', 500);
  await capture('horse-large');
  assert.equal((await apply(request({ commands: [], wipeDatabase: true }))).status, 200);
  captures.push({ name: 'wipe', commands: sent.at(-1)! });
  if (process.env.EZ_GEOMETRY_COMBINED_CAPTURE) await writeFile(process.env.EZ_GEOMETRY_COMBINED_CAPTURE, JSON.stringify({ boundary: 'Actual startup migration/runtime/snapshot, saved store edits, review/selection and acknowledged apply; external listener/transport mocked', originalCombat: transforms, startup: automatic[0], captures }, null, 2));
  console.log('PASS combined migration/save/review/apply, all five dimensions, partial removal and wipe');
} finally {
  globalThis.fetch = originalFetch;
  await stop?.();
  const target = resolve(root); assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)?.startsWith('ezconfig-geometry-combined-'));
  await rm(target, { recursive: true, force: true });
}

