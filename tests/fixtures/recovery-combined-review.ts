// All eight Recovery keys together through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('recovery-combined', async ({ set, reset, saved, apply }) => {
  const values = {
    WorldRecoveryTime: 0,
    WorldMissStaminaFactor: -1,
    ParriedRecoveryTimeOffset: -.05,
    ParriedRecoveryTimeMin: .9,
    ParriedRecoveryTimeMax: .2,
    ExtraStrikeLockout: 0,
    ExtraStabLockout: -.25,
    DynamicFeintWindow: true,
  };
  const formatted = Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
    typeof value === 'number' ? value.toFixed(2) : value ? 'True' : 'False',
  ]));
  const damage = { TeamHitRecovery: 'True', TeamHitRecoveryExtraTime: '1.50' };
  set('Character', 'Damage', 'TeamHitRecovery', true);
  set('Character', 'Damage', 'TeamHitRecoveryExtraTime', 1.5);
  assert.equal(categoryEntries(await apply(), 'Character', 'Recovery'), undefined);

  for (const [key, value] of Object.entries(values)) set('Character', 'Recovery', key, value);
  for (const [key, value] of Object.entries(values)) assert.equal(await saved('Character', 'Recovery', key), value);
  const combined = await apply();
  // The reversed parried limits are sent as saved, not sorted.
  assert.deepEqual(categoryEntries(combined, 'Character', 'Recovery'), formatted);
  assert.deepEqual(categoryEntries(combined, 'Character', 'Damage'), damage);
  assert.equal(categoryCommands(combined).length, 2);

  // Partial Reset preserves an independently saved maximum, zero and signed values.
  set('Character', 'Recovery', 'WorldRecoveryTime', .8);
  set('Character', 'Recovery', 'ParriedRecoveryTimeMax', 0);
  set('Character', 'Recovery', 'DynamicFeintWindow', false);
  for (const key of ['WorldMissStaminaFactor', 'ParriedRecoveryTimeOffset', 'ParriedRecoveryTimeMin', 'ExtraStrikeLockout']) reset('Character', 'Recovery', key);
  const partial = await apply();
  assert.deepEqual(categoryEntries(partial, 'Character', 'Recovery'), {
    WorldRecoveryTime: '0.80', ParriedRecoveryTimeMax: '0.00', ExtraStabLockout: '-0.25',
    DynamicFeintWindow: 'False',
  });
  assert.deepEqual(categoryEntries(partial, 'Character', 'Damage'), damage);

  for (const key of Object.keys(values)) reset('Character', 'Recovery', key);
  const cleared = await apply();
  assert.equal(categoryEntries(cleared, 'Character', 'Recovery'), undefined);
  assert.deepEqual(categoryEntries(cleared, 'Character', 'Damage'), damage);
  assert.equal(categoryCommands(cleared).length, 1);
});
console.log('PASS: eight combined Recovery keys, including DynamicFeintWindow save/apply/reset, native signed/zero values, reversed limits and wipe coexistence with TeamHit');
