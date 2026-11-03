// World recovery time through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('recovery-world', async ({ set, reset, saved, apply }) => {
  set('Character', 'Parry', 'ParryUpTime', 0.31);
  assert.equal(categoryEntries(await apply(), 'Character', 'Recovery'), undefined,
    'an unsaved recovery override sends no Recovery command');

  for (const value of [0, -0.25, 0.8]) {
    set('Character', 'Recovery', 'WorldRecoveryTime', value);
    assert.equal(await saved('Character', 'Recovery', 'WorldRecoveryTime'), value);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', 'Recovery'), { WorldRecoveryTime: value.toFixed(2) });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Parry'), { ParryUpTime: '0.31' });
  }

  // Reset removes the saved override, and the wipe clears its server value.
  reset('Character', 'Recovery', 'WorldRecoveryTime');
  assert.equal(await saved('Character', 'Recovery', 'WorldRecoveryTime'), undefined);
  assert.deepEqual(categoryCommands(await apply()), ['string ezconfig Character Parry {"ParryUpTime":"0.31"}']);
});
console.log('PASS: WorldRecoveryTime save, Apply, zero, negative, coexistence and Reset after a wipe');
