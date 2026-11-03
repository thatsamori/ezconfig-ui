// Sprint controls through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('movement-sprint', async ({ set, reset, saved, apply }) => {
  const fields = {
    PartialSprintModifier: 0, SprintModifier: -.5, SprintAcceleration: 350,
    SupersprintModifier: 2.3, TimeToMaxSprint: .8,
  };
  const adjacent = { MaxWalkSpeed: '200.00', MaxWalkSpeedCrouched: '80.00' };
  const formatted = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.toFixed(2)]));
  const movement = async () => categoryEntries(await apply(), 'Character', 'Movement');
  set('Character', 'Movement', 'MaxWalkSpeed', 200);
  set('Character', 'Movement', 'MaxWalkSpeedCrouched', 80);
  set('Character', 'Recovery', 'WorldRecoveryTime', .8);
  assert.deepEqual(await movement(), adjacent, 'without an edit there is no sprint override to send');

  for (const entries of [Object.entries(fields), Object.entries(fields).reverse()]) {
    for (const key of Object.keys(fields)) reset('Character', 'Movement', key);
    for (const [key, value] of entries) set('Character', 'Movement', key, value);
    assert.deepEqual(await movement(), { ...adjacent, ...formatted }, 'sprint controls and TimeToMaxSprint do not depend on insertion order');
  }
  for (const key of Object.keys(fields)) {
    for (const value of [0, -.25, 1.25]) {
      set('Character', 'Movement', key, value);
      assert.equal(await saved('Character', 'Movement', key), value);
      assert.deepEqual(await movement(), { ...adjacent, ...formatted, [key]: value.toFixed(2) }, 'one control changes without its siblings');
    }
    set('Character', 'Movement', key, fields[key as keyof typeof fields]);
  }

  // Reset removes only these keys; the wipe clears their earlier server state.
  reset('Character', 'Movement', 'SprintAcceleration');
  reset('Character', 'Movement', 'PartialSprintModifier');
  const partial = await apply();
  assert.deepEqual(categoryEntries(partial, 'Character', 'Movement'), {
    ...adjacent, SprintModifier: '-0.50', SupersprintModifier: '2.30', TimeToMaxSprint: '0.80',
  });
  assert.deepEqual(categoryEntries(partial, 'Character', 'Recovery'), { WorldRecoveryTime: '0.80' });
  for (const key of Object.keys(fields)) reset('Character', 'Movement', key);
  const cleared = await apply();
  assert.deepEqual(categoryEntries(cleared, 'Character', 'Movement'), adjacent);
  assert.equal(categoryCommands(cleared).length, 2);
});
console.log('PASS: four sprint controls plus TimeToMaxSprint, independent signed/zero inputs, insertion order, partial Reset after a wipe and adjacent controls');
