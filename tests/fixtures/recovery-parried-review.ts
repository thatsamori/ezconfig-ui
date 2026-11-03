// Parried recovery offset and limits through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('recovery-parried', async ({ set, reset, saved, apply }) => {
  for (const key of ['ParriedRecoveryTimeOffset', 'ParriedRecoveryTimeMin', 'ParriedRecoveryTimeMax']) {
    for (const value of [0, -.25]) {
      set('Character', 'Recovery', key, value);
      assert.equal(await saved('Character', 'Recovery', key), value);
      assert.deepEqual(categoryCommands(await apply()), [`string ezconfig Character Recovery {"${key}":"${value.toFixed(2)}"}`],
        'one configured key sends only that key');
    }
    reset('Character', 'Recovery', key);
  }

  // A reversed pair is sent as saved, not sorted.
  const pair = { ParriedRecoveryTimeOffset: -.05, ParriedRecoveryTimeMin: .9, ParriedRecoveryTimeMax: .2, WorldRecoveryTime: .8, WorldMissStaminaFactor: 2 };
  for (const [key, value] of Object.entries(pair)) set('Character', 'Recovery', key, value);
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Recovery'), {
    ParriedRecoveryTimeOffset: '-0.05', ParriedRecoveryTimeMin: '0.90', ParriedRecoveryTimeMax: '0.20', WorldRecoveryTime: '0.80', WorldMissStaminaFactor: '2.00',
  });

  // Reset removes only these keys; the wipe clears their earlier server state.
  for (const key of ['ParriedRecoveryTimeMin', 'ParriedRecoveryTimeOffset', 'WorldMissStaminaFactor']) reset('Character', 'Recovery', key);
  const partial = await apply();
  assert.deepEqual(categoryEntries(partial, 'Character', 'Recovery'), { ParriedRecoveryTimeMax: '0.20', WorldRecoveryTime: '0.80' },
    'Apply after a Reset wipes stale server overrides, then sends the remaining saved keys');
  assert.equal(categoryCommands(partial).length, 1);
});
console.log('PASS: parried recovery preserves independent signed values, reversed limits and partial Reset through the editor and Apply');
