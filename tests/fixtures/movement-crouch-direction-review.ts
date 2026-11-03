// Crouch and directional controls through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('movement-crouch-direction', async ({ set, reset, saved, apply }) => {
  const fields = {
    MaxWalkSpeedCrouched: 80, MaxWalkSpeedCrouchedWithRatPerk: 180,
    BackpedalModifier: -.25, StrafeModifier: 0,
  };
  const adjacent = { MaxWalkSpeed: '200.00', TimeToMaxSprint: '0.96' };
  const formatted = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.toFixed(2)]));
  const movement = async () => categoryEntries(await apply(), 'Character', 'Movement');
  set('Character', 'Movement', 'MaxWalkSpeed', 200);
  set('Character', 'Movement', 'TimeToMaxSprint', .96);
  set('Character', 'Recovery', 'WorldRecoveryTime', .8);
  assert.deepEqual(await movement(), adjacent, 'without an edit there is no crouch or direction override to send');

  for (const entries of [Object.entries(fields), Object.entries(fields).reverse()]) {
    for (const key of Object.keys(fields)) reset('Character', 'Movement', key);
    for (const [key, value] of entries) set('Character', 'Movement', key, value);
    assert.deepEqual(await movement(), { ...adjacent, ...formatted }, 'saved insertion order does not couple controls');
  }
  for (const key of Object.keys(fields)) {
    for (const value of [0, -.5, 1.25]) {
      set('Character', 'Movement', key, value);
      assert.equal(await saved('Character', 'Movement', key), value);
      assert.deepEqual(await movement(), { ...adjacent, ...formatted, [key]: value.toFixed(2) }, 'one control changes without its siblings');
    }
    set('Character', 'Movement', key, fields[key as keyof typeof fields]);
  }

  // Reset removes only these keys; the wipe clears their earlier server state.
  reset('Character', 'Movement', 'MaxWalkSpeedCrouched');
  reset('Character', 'Movement', 'BackpedalModifier');
  const partial = await apply();
  assert.deepEqual(categoryEntries(partial, 'Character', 'Movement'), {
    ...adjacent, MaxWalkSpeedCrouchedWithRatPerk: '180.00', StrafeModifier: '0.00',
  });
  assert.deepEqual(categoryEntries(partial, 'Character', 'Recovery'), { WorldRecoveryTime: '0.80' });
  for (const key of Object.keys(fields)) reset('Character', 'Movement', key);
  const cleared = await apply();
  assert.deepEqual(categoryEntries(cleared, 'Character', 'Movement'), adjacent);
  assert.equal(categoryCommands(cleared).length, 2);
});
console.log('PASS: four independent crouch/direction controls, signed/zero inputs, key order, partial Reset after a wipe and adjacent controls');
