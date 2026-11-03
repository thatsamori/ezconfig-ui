// The flinch detector window beside a disabled TrueCombo, through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryEntries, featureReview } from './feature-review-harness';

await featureReview('parry-detector', async ({ set, reset, saved, apply }) => {
  const key = 'GiveMissParryIfFlinchedBeforeDuration';
  set('Character', 'Parry', 'TrueCombo', false);
  set('Character', 'Parry', 'TrueComboRecoveryTime', 0.73);
  set('Character', 'Parry', 'TrueComboStamina', -17);
  for (const window of [0, 1.25]) {
    set('Character', 'Parry', key, window);
    assert.equal(await saved('Character', 'Parry', key), window);
    assert.deepEqual(categoryEntries(await apply(), 'Character', 'Parry'), {
      [key]: window.toFixed(2), TrueCombo: 'False', TrueComboRecoveryTime: '0.73', TrueComboStamina: '-17.00',
    }, 'the window does not enable TrueCombo or change its parameters');
  }

  // Reset removes only these keys; the wipe clears their earlier server state.
  reset('Character', 'Parry', key);
  reset('Character', 'Parry', 'TrueComboStamina');
  assert.equal(await saved('Character', 'Parry', key), undefined);
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Parry'), { TrueCombo: 'False', TrueComboRecoveryTime: '0.73' });
});
console.log('PASS: independent detector zero/positive saves and Apply; TrueCombo remains disabled and its parameters unchanged; Reset after a wipe');
