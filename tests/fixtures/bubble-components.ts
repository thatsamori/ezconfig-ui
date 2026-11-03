// Bubble length and height difference as independent components beside the radius, through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { categoryEntries, featureReview } from './feature-review-harness';

const x = 'EllipseBubbleLength', y = 'EllipseBubbleMaxHeightDiff';
const capture: { name: string; commands: string[]; expected: Record<string, number> }[] = [];
await featureReview('bubble-components', async ({ set, reset, saved, apply }) => {
  async function applyStored(name: string, expected: Record<string, number>) {
    for (const key of [x, y, 'EllipseBubbleRadius']) assert.equal(await saved('Character', 'Movement', key), expected[key]);
    const output = await apply(name);
    const sent = Object.keys(expected).length ? Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, String(value)])) : undefined;
    assert.deepEqual(categoryEntries(output, 'Character', 'Movement'), sent);
    capture.push({ name, commands: output, expected });
  }
  set('Character', 'Movement', y, 100);
  await applyStored('height-only', { [y]: 100 });
  set('Character', 'Movement', x, 75);
  await applyStored('height-then-length', { [y]: 100, [x]: 75 });
  reset('Character', 'Movement', y);
  await applyStored('remove-height-retain-length', { [x]: 75 });
  set('Character', 'Movement', y, -5);
  await applyStored('length-then-height', { [x]: 75, [y]: -5 });
  reset('Character', 'Movement', x);
  await applyStored('remove-length-retain-height', { [y]: -5 });
  reset('Character', 'Movement', y);
  await applyStored('remove-all', {});
  set('Character', 'Movement', 'EllipseBubbleRadius', 220);
  set('Character', 'Movement', y, 15);
  await applyStored('radius-and-height', { EllipseBubbleRadius: 220, [y]: 15 });
  reset('Character', 'Movement', y);
  await applyStored('radius-remove-height', { EllipseBubbleRadius: 220 });
});
if (process.env.EZ_GEOMETRY_COMPONENT_CAPTURE_PATH) await writeFile(process.env.EZ_GEOMETRY_COMPONENT_CAPTURE_PATH, JSON.stringify(capture, null, 2));
console.log('PASS: independent persisted presence/order, Apply after a wipe, and replacement removing either component.');
