// Forward parry length and half-width as independent components, through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { categoryEntries, featureReview } from './feature-review-harness';

const x = 'ForwardParryLength', y = 'ForwardParryHalfWidth';
const capture: { name: string; commands: string[]; expected: Record<string, number> }[] = [];
await featureReview('geometry-components', async ({ set, reset, saved, apply }) => {
  async function applyStored(name: string, expected: Record<string, number>) {
    for (const key of [x, y]) assert.equal(await saved('Character', 'Parry', key), expected[key]);
    const output = await apply(name);
    const sent = Object.keys(expected).length ? Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, String(value)])) : undefined;
    assert.deepEqual(categoryEntries(output, 'Character', 'Parry'), sent);
    capture.push({ name, commands: output, expected });
  }
  set('Character', 'Parry', y, 100);
  await applyStored('width-only', { [y]: 100 });
  set('Character', 'Parry', x, 75);
  await applyStored('width-then-length', { [y]: 100, [x]: 75 });
  reset('Character', 'Parry', y);
  await applyStored('remove-width-retain-length', { [x]: 75 });
  set('Character', 'Parry', y, -5);
  await applyStored('length-then-width', { [x]: 75, [y]: -5 });
  reset('Character', 'Parry', x);
  await applyStored('remove-length-retain-width', { [y]: -5 });
  reset('Character', 'Parry', y);
  await applyStored('remove-all', {});
});
if (process.env.EZ_GEOMETRY_COMPONENT_CAPTURE_PATH) await writeFile(process.env.EZ_GEOMETRY_COMPONENT_CAPTURE_PATH, JSON.stringify(capture, null, 2));
console.log('PASS: independent persisted presence/order, Apply after a wipe, and replacement removing either component.');
