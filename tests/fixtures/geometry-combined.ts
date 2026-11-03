// All five geometry dimensions after the real parry-geometry startup migration, through the editor
// and Apply, on the feature review harness. The startup check stays with that migration (online-platform#41).
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { ConfigValue } from '../../src/lib/database/types';
import { categoryCommands, categoryEntries, featureReview, WIPE } from './feature-review-harness';

// The automatic sync's listener is mocked; what it delivers goes to the harness's mocked RCON.
mock.module('../../src/lib/rcon/sync-listener', () => ({ connectSyncListener: async () => { let close!: () => void; const closed = new Promise<void>(resolve => { close = resolve; }); return { closed, close: async () => close() }; } }));
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
const ownershipPort = (probe.address() as { port: number }).port;
await new Promise<void>(resolve => probe.close(() => resolve()));

/** Every value a batch sends as category/key/value, so batches compare regardless of order. */
const contents = (batch: string[]) => categoryCommands(batch).flatMap(command => {
  const [database, category] = command.split(' ').slice(2, 4);
  return Object.entries(categoryEntries(batch, database, category)!).map(([key, value]) => `${database}/${category}/${key}/${value}`);
}).sort();
const geometry: Record<string, string[]> = { Parry: ['ForwardParryLength', 'ForwardParryHalfWidth'], Movement: ['EllipseBubbleRadius', 'EllipseBubbleLength', 'EllipseBubbleMaxHeightDiff'] };
/** The geometry dimensions a batch sends, by key. */
const dimensions = (batch: string[]) => Object.fromEntries(Object.entries(geometry).flatMap(([category, keys]) =>
  Object.entries(categoryEntries(batch, 'Character', category) ?? {}).filter(([key]) => keys.includes(key))));

await featureReview('geometry-combined', async ({ set, reset, saved, storeUnvalidated, apply, synced }) => {
  const { PARRY_TRANSFORM_KEYS } = await import('../../src/lib/migrations/parry-geometry');
  const { registerServerStartup } = await import('../../src/lib/server-startup');
  const { stopRegisteredAutomaticSync } = await import('../../src/lib/rcon/automatic-sync-bootstrap');
  // Representative valid legacy transform payloads, saved in Combat as the older schema did.
  const transforms = Object.fromEntries(PARRY_TRANSFORM_KEYS.map(key => [key, key.endsWith('Scale') ? { x: 1, y: 1, z: 1 } : { x: 0, y: 0, z: 0 }]));
  const parry: Record<string, ConfigValue> = { ForwardParryLength: 50, ForwardParryHalfWidth: 100, ParryUpTime: 2, TrueCombo: false, ExperimentalParry: false, [PARRY_TRANSFORM_KEYS[0]]: { x: 0, y: 0, z: 0 } };
  const movement: Record<string, number> = { EllipseBubbleRadius: 220, EllipseBubbleLength: 200, EllipseBubbleMaxHeightDiff: 150, MaxWalkSpeedCrouched: 80, MaxWalkSpeedCrouchedWithRatPerk: 160 };
  await storeUnvalidated('Character', 'Combat', { ...transforms, CanJumpKick: true });
  await storeUnvalidated('Character', 'Parry', parry);
  await storeUnvalidated('Character', 'Movement', movement);
  await storeUnvalidated('Character', 'DebugTools', { AllowVisualizeBlockCollider: false });
  try {
    await registerServerStartup({ NEXT_RUNTIME: 'nodejs', RCON_AUTO_SYNC_ENABLED: 'true', DATABASES_PATH: process.env.DATABASES_PATH, PRESETS_PATH: process.env.PRESETS_PATH, RCON_HOST: '127.0.0.1', RCON_PORT: '17947', RCON_PASSWORD: 'isolated-placeholder', RCON_AUTO_SYNC_OWNER_PORT: String(ownershipPort) });
    const deadline = Date.now() + 2000;
    while (!synced().length) { assert(Date.now() < deadline, 'the startup sync delivers its snapshot'); await Bun.sleep(5); }
    const [startup, ...later] = synced();
    assert.deepEqual(later, []);
    assert.equal(startup[0], WIPE);
    for (const key of PARRY_TRANSFORM_KEYS) {
      assert.equal(await saved('Character', 'Combat', key), undefined);
      assert.deepEqual(await saved('Character', 'Parry', key), transforms[key]);
    }
    assert.equal(await saved('Character', 'Combat', 'CanJumpKick'), true);

    const captures = [{ name: 'automatic-migrated-startup', commands: startup }];
    const capture = async (name: string) => {
      const commands = await apply(name);
      captures.push({ name, commands });
      return commands;
    };
    const migrated = await capture('migrated-all');
    assert.deepEqual(contents(migrated), contents(startup), 'manual Apply and real migrated startup snapshot agree regardless of key order');
    assert.deepEqual(categoryEntries(migrated, 'Character', 'Combat'), { CanJumpKick: 'True' });
    const parrySent = categoryEntries(migrated, 'Character', 'Parry')!;
    assert.equal(PARRY_TRANSFORM_KEYS.filter(key => Object.hasOwn(parrySent, key)).length, 6);
    assert.deepEqual(dimensions(migrated), { ForwardParryLength: '50', ForwardParryHalfWidth: '100', EllipseBubbleRadius: '220', EllipseBubbleLength: '200', EllipseBubbleMaxHeightDiff: '150' });
    // Load the actual canonical saved state through the editor before exercising its edits.
    for (const [key, value] of Object.entries({ ...transforms, ...parry })) set('Character', 'Parry', key, value);
    for (const [key, value] of Object.entries(movement)) set('Character', 'Movement', key, value);
    set('Character', 'Parry', 'ForwardParryLength', 0);
    set('Character', 'Parry', 'ForwardParryHalfWidth', 0);
    set('Character', 'Movement', 'EllipseBubbleRadius', 60);
    set('Character', 'Movement', 'EllipseBubbleLength', 0);
    set('Character', 'Movement', 'EllipseBubbleMaxHeightDiff', 0);
    assert.deepEqual(dimensions(await capture('updated-all')),
      { ForwardParryLength: '0', ForwardParryHalfWidth: '0', EllipseBubbleRadius: '60', EllipseBubbleLength: '0', EllipseBubbleMaxHeightDiff: '0' });
    reset('Character', 'Parry', 'ForwardParryHalfWidth');
    reset('Character', 'Movement', 'EllipseBubbleLength');
    assert.deepEqual(dimensions(await capture('remove-width-and-length')),
      { ForwardParryLength: '0', EllipseBubbleRadius: '60', EllipseBubbleMaxHeightDiff: '0' });
    set('Character', 'Parry', 'ForwardParryHalfWidth', 100);
    set('Character', 'Parry', 'ForwardParryLength', 50);
    for (const [key, value] of Object.entries(movement)) set('Character', 'Movement', key, value);
    assert.deepEqual(contents(await capture('reapply-all')), contents(migrated), 'the original values restore the migrated configuration');
    set('Character', 'Movement', 'EllipseBubbleRadius', 500);
    assert.deepEqual(dimensions(await capture('horse-large')), { ...dimensions(migrated), EllipseBubbleRadius: '500' });
    // Every saved key back at its game default: Apply delivers the wipe alone.
    for (const key of Object.keys({ ...transforms, ...parry })) reset('Character', 'Parry', key);
    for (const key of Object.keys(movement)) reset('Character', 'Movement', key);
    reset('Character', 'Combat', 'CanJumpKick');
    reset('Character', 'DebugTools', 'AllowVisualizeBlockCollider');
    assert.deepEqual(await capture('wipe'), [WIPE]);
    if (process.env.EZ_GEOMETRY_COMBINED_CAPTURE) await writeFile(process.env.EZ_GEOMETRY_COMBINED_CAPTURE, JSON.stringify({ boundary: 'Actual startup migration/runtime/snapshot, saved editor edits and Apply of the whole configuration after a wipe; external listener/transport mocked', originalCombat: transforms, startup, captures }, null, 2));
  } finally {
    await stopRegisteredAutomaticSync();
  }
});
console.log('PASS combined migration/save/Apply, all five dimensions, partial removal and wipe');
