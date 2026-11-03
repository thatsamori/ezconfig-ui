// All five geometry dimensions beside the six block collider transforms, through the editor and Apply,
// on the feature review harness.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import type { ConfigValue } from '../../src/lib/database/types';
import { categoryCommands, categoryEntries, featureReview, WIPE } from './feature-review-harness';

/** Parry keys, which older schemas kept in Combat. */
const TRANSFORM_KEYS = [
  'LowBlockColliderRelativeOffsetLocation', 'LowBlockColliderRelativeOffsetRotation',
  'LowBlockColliderRelativeOffsetScale', 'HighBlockColliderRelativeOffsetLocation',
  'HighBlockColliderRelativeOffsetRotation', 'HighBlockColliderRelativeOffsetScale',
];
/** Every value a batch sends as category/key/value, so batches compare regardless of order. */
const contents = (batch: string[]) => categoryCommands(batch).flatMap(command => {
  const [database, category] = command.split(' ').slice(2, 4);
  return Object.entries(categoryEntries(batch, database, category)!).map(([key, value]) => `${database}/${category}/${key}/${value}`);
}).sort();
const geometry: Record<string, string[]> = { Parry: ['ForwardParryLength', 'ForwardParryHalfWidth'], Movement: ['EllipseBubbleRadius', 'EllipseBubbleLength', 'EllipseBubbleMaxHeightDiff'] };
/** The geometry dimensions a batch sends, by key. */
const dimensions = (batch: string[]) => Object.fromEntries(Object.entries(geometry).flatMap(([category, keys]) =>
  Object.entries(categoryEntries(batch, 'Character', category) ?? {}).filter(([key]) => keys.includes(key))));

await featureReview('geometry-combined', async ({ set, reset, saved, storeUnvalidated, apply }) => {
  // Representative valid transform payloads, saved in Combat as the older schema did.
  const transforms = Object.fromEntries(TRANSFORM_KEYS.map(key => [key, key.endsWith('Scale') ? { x: 1, y: 1, z: 1 } : { x: 0, y: 0, z: 0 }]));
  const parry: Record<string, ConfigValue> = { ForwardParryLength: 50, ForwardParryHalfWidth: 100, ParryUpTime: 2, TrueCombo: false, ExperimentalParry: false, [TRANSFORM_KEYS[0]]: { x: 0, y: 0, z: 0 } };
  const movement: Record<string, number> = { EllipseBubbleRadius: 220, EllipseBubbleLength: 200, EllipseBubbleMaxHeightDiff: 150, MaxWalkSpeedCrouched: 80, MaxWalkSpeedCrouchedWithRatPerk: 160 };
  await storeUnvalidated('Character', 'Combat', { ...transforms, CanJumpKick: true });
  await storeUnvalidated('Character', 'Parry', parry);
  await storeUnvalidated('Character', 'Movement', movement);
  await storeUnvalidated('Character', 'DebugTools', { AllowVisualizeBlockCollider: false });
  // Character values are kept by key, so the Draft places the transforms under Parry.
  for (const key of TRANSFORM_KEYS) {
    assert.equal(await saved('Character', 'Combat', key), undefined);
    assert.deepEqual(await saved('Character', 'Parry', key), transforms[key]);
  }
  assert.equal(await saved('Character', 'Combat', 'CanJumpKick'), true);

  const captures: { name: string; commands: string[] }[] = [];
  const capture = async (name: string) => {
    const commands = await apply(name);
    captures.push({ name, commands });
    return commands;
  };
  const stored = await capture('stored-all');
  assert.deepEqual(categoryEntries(stored, 'Character', 'Combat'), { CanJumpKick: 'True' });
  const parrySent = categoryEntries(stored, 'Character', 'Parry')!;
  assert.equal(TRANSFORM_KEYS.filter(key => Object.hasOwn(parrySent, key)).length, 6);
  assert.deepEqual(dimensions(stored), { ForwardParryLength: '50', ForwardParryHalfWidth: '100', EllipseBubbleRadius: '220', EllipseBubbleLength: '200', EllipseBubbleMaxHeightDiff: '150' });
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
  assert.deepEqual(contents(await capture('reapply-all')), contents(stored), 'the original values restore the stored configuration');
  set('Character', 'Movement', 'EllipseBubbleRadius', 500);
  assert.deepEqual(dimensions(await capture('horse-large')), { ...dimensions(stored), EllipseBubbleRadius: '500' });
  // Every saved key back at its game default: Apply delivers the wipe alone.
  for (const key of Object.keys({ ...transforms, ...parry })) reset('Character', 'Parry', key);
  for (const key of Object.keys(movement)) reset('Character', 'Movement', key);
  reset('Character', 'Combat', 'CanJumpKick');
  reset('Character', 'DebugTools', 'AllowVisualizeBlockCollider');
  assert.deepEqual(await capture('wipe'), [WIPE]);
  if (process.env.EZ_GEOMETRY_COMBINED_CAPTURE) await writeFile(process.env.EZ_GEOMETRY_COMBINED_CAPTURE, JSON.stringify({ boundary: 'Feature review harness: a stored Draft, saved editor edits and Apply of the whole configuration after a wipe', storedCombat: transforms, captures }, null, 2));
});
console.log('PASS combined save/Apply, all five dimensions beside the transforms, partial removal and wipe');
