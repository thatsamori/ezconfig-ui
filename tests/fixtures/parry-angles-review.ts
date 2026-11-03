// The two parry angles through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('parry-angles', async ({ set, reset, saved, apply }) => {
  for (const key of ['MaxParryAngle', 'MaxParryWeaponAngle']) {
    set('Character', 'Parry', key, 0);
    assert.equal(await saved('Character', 'Parry', key), 0);
    assert.deepEqual(categoryEntries(await apply(), 'Character', 'Parry'), { [key]: '0.00' },
      'one configured angle sends only itself, zero included');
    reset('Character', 'Parry', key);
  }

  set('Character', 'Parry', 'MaxParryAngle', 17.25);
  set('Character', 'Parry', 'MaxParryWeaponAngle', 63.5);
  set('Character', 'Parry', 'TrueCombo', false);
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Parry'), {
    MaxParryAngle: '17.25', MaxParryWeaponAngle: '63.50', TrueCombo: 'False',
  });

  // Reset removes only this key; the wipe clears its earlier server state.
  reset('Character', 'Parry', 'MaxParryAngle');
  assert.equal(await saved('Character', 'Parry', 'MaxParryAngle'), undefined);
  assert.deepEqual(categoryCommands(await apply()), [
    'string ezconfig Character Parry {"MaxParryWeaponAngle":"63.50","TrueCombo":"False"}',
  ]);
});
console.log('PASS: independent parry angles preserve zero, distinct values, TrueCombo coexistence and Reset after a wipe');
