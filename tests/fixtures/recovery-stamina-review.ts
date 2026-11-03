// World miss stamina factor through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('recovery-stamina', async ({ set, reset, saved, apply }) => {
  set('Character', 'Parry', 'ParryUpTime', 0.31);
  assert.equal(categoryEntries(await apply(), 'Character', 'Recovery'), undefined,
    'an unsaved recovery override sends no Recovery command');

  set('Character', 'Recovery', 'WorldRecoveryTime', 0.75);
  for (const value of [0, -1, 2]) {
    set('Character', 'Recovery', 'WorldMissStaminaFactor', value);
    assert.equal(await saved('Character', 'Recovery', 'WorldMissStaminaFactor'), value);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', 'Recovery'), { WorldRecoveryTime: '0.75', WorldMissStaminaFactor: value.toFixed(2) });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Parry'), { ParryUpTime: '0.31' });
  }

  // Removing just the duration never manufactures it when the stamina factor is saved.
  set('Character', 'Recovery', 'WorldMissStaminaFactor', 0);
  reset('Character', 'Recovery', 'WorldRecoveryTime');
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Recovery'), { WorldMissStaminaFactor: '0.00' });

  // Removing just the factor preserves the independent duration.
  set('Character', 'Recovery', 'WorldRecoveryTime', 0.75);
  reset('Character', 'Recovery', 'WorldMissStaminaFactor');
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Recovery'), { WorldRecoveryTime: '0.75' });

  // Reset removes the saved override, and the wipe clears its server value.
  reset('Character', 'Recovery', 'WorldRecoveryTime');
  assert.equal(await saved('Character', 'Recovery', 'WorldMissStaminaFactor'), undefined);
  assert.deepEqual(categoryCommands(await apply()), ['string ezconfig Character Parry {"ParryUpTime":"0.31"}']);
});
console.log('PASS: WorldMissStaminaFactor save, Apply, zero, negative, coexistence and Reset after a wipe');
