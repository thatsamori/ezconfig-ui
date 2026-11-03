// Walking speed through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryEntries, featureReview, WIPE } from './feature-review-harness';

await featureReview('movement-walk', async ({ set, reset, saved, apply }) => {
  set('Character', 'Parry', 'ParryUpTime', 0.31);
  set('Character', 'Movement', 'TimeToMaxSprint', 0.96);
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Movement'), { TimeToMaxSprint: '0.96' },
    'without an edit there is no walking override to send');

  for (const value of [0, -100, 450]) {
    set('Character', 'Movement', 'MaxWalkSpeed', value);
    assert.equal(await saved('Character', 'Movement', 'MaxWalkSpeed'), value);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', 'Movement'), { TimeToMaxSprint: '0.96', MaxWalkSpeed: value.toFixed(2) });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Parry'), { ParryUpTime: '0.31' });
  }

  // Reset removes only this key; the wipe clears its earlier server state.
  reset('Character', 'Movement', 'MaxWalkSpeed');
  assert.equal(await saved('Character', 'Movement', 'MaxWalkSpeed'), undefined);
  const batch = await apply();
  assert.equal(batch[0], WIPE);
  assert.deepEqual(batch.slice(1).sort(), [
    'string ezconfig Character Movement {"TimeToMaxSprint":"0.96"}',
    'string ezconfig Character Parry {"ParryUpTime":"0.31"}',
  ]);
});
console.log('PASS: MaxWalkSpeed store/save/Apply, signed/zero values, TimeToMaxSprint and Parry coexistence, Reset after a wipe');
