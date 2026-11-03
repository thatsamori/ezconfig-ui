// Camera policy through the editor and Apply, on the feature review harness. Presets,
// hand-made commands and automatic startup stay in camera-policy-flow.ts.
import assert from 'node:assert/strict';
import { categoryEntries, featureReview, WIPE } from './feature-review-harness';

await featureReview('camera-policy', async ({ set, reset, saved, editorValue, saveUnchecked, storeUnvalidated, apply }) => {
  const camera = async () => ({ CustomFOV: await saved('Character', 'Camera', 'CustomFOV'), CustomFOVMax: await saved('Character', 'Camera', 'CustomFOVMax') });
  const sent = async (stage: string) => categoryEntries(await apply(stage), 'Character', 'Camera');

  set('Character', 'Camera', 'CustomFOVMax', 179);
  assert.deepEqual(await camera(), { CustomFOV: undefined, CustomFOVMax: 179 });
  assert.deepEqual(await sent('maximum-only-off'), { CustomFOVMax: '179' });
  set('Character', 'Camera', 'CustomFOV', true);
  assert.deepEqual(await camera(), { CustomFOV: true, CustomFOVMax: 179 });
  assert.deepEqual(await sent('enable-with-maximum'), { CustomFOVMax: '179', CustomFOV: 'True' });
  for (const value of [101, 120, 179]) {
    set('Character', 'Camera', 'CustomFOVMax', value);
    assert.deepEqual(await camera(), { CustomFOV: true, CustomFOVMax: value });
    assert.deepEqual(await sent('maximum-' + value), { CustomFOVMax: String(value), CustomFOV: 'True' });
  }

  // The editor refuses these, so the shown and saved values stay; a refused save would reject camera() instead.
  for (const value of [100, 180, 120.0000001, 179.0000001, 100.9999999, NaN, Infinity, -Infinity, '120', true]) set('Character', 'Camera', 'CustomFOVMax', value);
  set('Character', 'Camera', 'CustomFOV', 'garbage');
  assert.equal(editorValue('Character', 'Camera', 'CustomFOVMax'), 179);
  assert.equal(editorValue('Character', 'Camera', 'CustomFOV'), true);
  assert.deepEqual(await camera(), { CustomFOV: true, CustomFOVMax: 179 });
  // The server refuses them too. A null is Reset in these per-key saves; camera-policy-flow checks the whole-category write refuses it.
  for (const value of [100, 180, 120.0000001, 179.0000001, 100.9999999, '120', true, {}]) {
    assert.equal(await saveUnchecked('Character', 'Camera', { CustomFOV: false, CustomFOVMax: value }), 400, JSON.stringify(value));
    assert.deepEqual(await camera(), { CustomFOV: true, CustomFOVMax: 179 });
  }

  set('Character', 'Camera', 'CustomFOV', false);
  assert.deepEqual(await camera(), { CustomFOV: false, CustomFOVMax: 179 });
  assert.deepEqual(await sent('disabled-retains-maximum'), { CustomFOVMax: '179', CustomFOV: 'False' });

  // Reset to the game default: the maximum (120) and then the toggle (off) are no longer sent.
  set('Character', 'Camera', 'CustomFOV', true);
  reset('Character', 'Camera', 'CustomFOVMax');
  assert.deepEqual(await camera(), { CustomFOV: true, CustomFOVMax: undefined });
  assert.deepEqual(await sent('maximum-removal-default120'), { CustomFOV: 'True' });
  set('Character', 'Camera', 'CustomFOV', true);
  assert.deepEqual(await sent('toggle-only-default120'), { CustomFOV: 'True' });
  reset('Character', 'Camera', 'CustomFOV');
  assert.deepEqual(await camera(), { CustomFOV: undefined, CustomFOVMax: undefined });
  assert.deepEqual(await apply('toggle-removal-defaultfalse'), [WIPE]);

  // Damaged storage refuses Apply: nothing is delivered, and what is stored is left as it was.
  for (const damaged of [{ CustomFOV: true, CustomFOVMax: 120.5 }, { CustomFOV: 'garbage', CustomFOVMax: 120 }]) {
    await storeUnvalidated('Character', 'Camera', damaged);
    await assert.rejects(apply(), /Apply was refused \(400\)/);
    assert.deepEqual(await camera(), damaged);
  }
}, { capture: process.env.EZ_CAMERA_REVIEW_CAPTURE_PATH });
console.log('PASS: Camera policy through the editor and Apply: validated edits and saves, maximum and toggle, reset to defaults and damaged storage');
