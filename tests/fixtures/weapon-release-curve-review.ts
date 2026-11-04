// A release curve through the editor, the Draft and Apply, on the feature review harness (stab-curve-keys#04).
import assert from 'node:assert/strict';
import { STOCK_RELEASE_CURVE } from '../../src/lib/config/releaseCurve';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

const FAST_START = [0, 0, 0.2, 0.9, 1, 1];
const LATE_WHIP = [0, 0, 0.8, 0.1, 1, 1];
const key = 'ReleaseCurve';

await featureReview('weapon-release-curve', async ({ set, reset, saved, editorValue, saveUnchecked, storeUnvalidated, apply }) => {
  // Each weapon and each stab category has its own curve, beside its other keys.
  set('Longsword', 'Stab', key, FAST_START);
  set('Longsword', 'Stab', 'Release', 0.31);
  set('Longsword', 'AltStab', key, LATE_WHIP);
  set('Rapier', 'Stab', key, STOCK_RELEASE_CURVE);
  assert.deepEqual(await saved('Longsword', 'Stab', key), FAST_START, 'the Draft keeps the points as they are');
  assert.deepEqual(await saved('Longsword', 'AltStab', key), LATE_WHIP);
  assert.deepEqual(await saved('Rapier', 'Stab', key), STOCK_RELEASE_CURVE);
  assert.equal(await saved('Rapier', 'AltStab', key), undefined, 'a category with no override has nothing in the Draft');

  const initial = await apply('initial');
  assert.deepEqual(categoryCommands(initial), [
    'string ezconfig Longsword AltStab {"ReleaseCurve":"0.00,0.00,0.80,0.10,1.00,1.00"}',
    'string ezconfig Longsword Stab {"ReleaseCurve":"0.00,0.00,0.20,0.90,1.00,1.00","Release":"0.31"}',
    'string ezconfig Rapier Stab {"ReleaseCurve":"0.00,0.00,0.48,0.32,0.63,0.44,0.69,0.50,0.79,0.62,0.85,0.71,0.93,0.85,1.00,1.00"}',
  ], 'the commands the mod takes');

  // A save holding a bad shape, an off-grid value or the key in a strike is refused, and the Draft stays as it was.
  for (const bad of [[0, 0, 0.5, 0.5], [0, 0, 1], [], [0, 0, 0.205, 0.9, 1, 1], [0, 0, 0.5, 0.5, 0.4, 0.6, 1, 1]]) {
    assert.equal(await saveUnchecked('Longsword', 'Stab', { [key]: bad }), 400, JSON.stringify(bad));
  }
  for (const strike of ['Strike', 'AltStrike']) assert.equal(await saveUnchecked('Longsword', strike, { [key]: FAST_START }), 400, strike);
  assert.deepEqual(await saved('Longsword', 'Stab', key), FAST_START);

  // Reset removes the override, so the stab goes back to the real stock curve: nothing is sent for it, after the wipe.
  reset('Longsword', 'AltStab', key);
  const removed = await apply('removed');
  assert.equal(categoryEntries(removed, 'Longsword', 'AltStab'), undefined);
  assert.deepEqual(categoryEntries(removed, 'Longsword', 'Stab'), { ReleaseCurve: '0.00,0.00,0.20,0.90,1.00,1.00', Release: '0.31' });

  // An older Draft that holds a bad shape: Apply is refused with the reason, and sends nothing, until it is fixed.
  await storeUnvalidated('Longsword', 'Stab', { [key]: [0, 0, 0.5, 0.5] });
  await assert.rejects(apply('bad-shape'), /Apply was refused \(400\).*Longsword\/Stab\/ReleaseCurve: End the curve at \(1,1\)\./);
  set('Longsword', 'Stab', key, LATE_WHIP);
  assert.deepEqual(categoryEntries(await apply('fixed'), 'Longsword', 'Stab'), { ReleaseCurve: '0.00,0.00,0.80,0.10,1.00,1.00', Release: '0.31' });

  // An older Draft that holds the key in a strike: the editor has it, so it can be reset, and until then Apply is refused.
  await storeUnvalidated('Longsword', 'Strike', { [key]: FAST_START });
  assert.deepEqual(editorValue('Longsword', 'Strike', key), FAST_START);
  await assert.rejects(apply('in-a-strike'), /Apply was refused \(400\).*Longsword\/Strike\/ReleaseCurve: Use this key only in Stab and AltStab\./);
  reset('Longsword', 'Strike', key);
  assert.equal(await saved('Longsword', 'Strike', key), undefined);
  assert.equal(categoryEntries(await apply('strike-reset'), 'Longsword', 'Strike'), undefined);
});
console.log('PASS: curves per weapon and stab category saved and sent as the mod takes them; bad shapes, the grid and strikes refused; reset and older Drafts');
