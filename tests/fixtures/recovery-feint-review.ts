// Strike and stab feint extras through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('recovery-feint', async ({ set, reset, saved, apply }) => {
  for (const key of ['ExtraStrikeLockout', 'ExtraStabLockout']) {
    for (const value of [0, -.25, .8]) {
      set('Character', 'Recovery', key, value);
      assert.equal(await saved('Character', 'Recovery', key), value);
      assert.deepEqual(categoryCommands(await apply()), [`string ezconfig Character Recovery {"${key}":"${value.toFixed(2)}"}`],
        'one configured key sends only that key');
    }
    reset('Character', 'Recovery', key);
  }
  const combined = { ExtraStrikeLockout: .8, ExtraStabLockout: -.2, WorldRecoveryTime: .3, WorldMissStaminaFactor: 2, ParriedRecoveryTimeMin: 0 };
  for (const [key, value] of Object.entries(combined)) set('Character', 'Recovery', key, value);
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Recovery'), {
    ExtraStrikeLockout: '0.80', ExtraStabLockout: '-0.20', WorldRecoveryTime: '0.30', WorldMissStaminaFactor: '2.00', ParriedRecoveryTimeMin: '0.00',
  });

  // Reset removes only these keys; the wipe clears their earlier server state.
  for (const key of ['ExtraStrikeLockout', 'WorldMissStaminaFactor', 'ParriedRecoveryTimeMin']) reset('Character', 'Recovery', key);
  const partial = await apply();
  assert.deepEqual(categoryEntries(partial, 'Character', 'Recovery'), { ExtraStabLockout: '-0.20', WorldRecoveryTime: '0.30' });
  assert.equal(categoryCommands(partial).length, 1);
});
console.log('PASS: independent feint extras, signed values, coexistence and partial Reset after a wipe');
