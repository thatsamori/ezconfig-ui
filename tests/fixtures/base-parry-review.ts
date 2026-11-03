// The ten base parry keys beside disabled feature settings, through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('base-parry', async ({ set, saved, apply }) => {
  const { BASE_PARRY_CONFIG_OPTIONS } = await import('../../src/lib/config/baseParryConfigSchema');
  const baseEntries = Object.fromEntries(BASE_PARRY_CONFIG_OPTIONS.map((entry, index) =>
    [entry.configKey, (index + 1) / 10]));
  baseEntries.ParryUpTime = 0;
  baseEntries.ParryRecoveryTime = 0.31;
  baseEntries.HeldParryRecoveryTime = 0.62;
  baseEntries.MissParryRecoveryTime = 0;
  const entries = { ...baseEntries, ExperimentalParry: false, ExperimentalParryDuration: 0.07, TrueCombo: false, TrueComboRecoveryTime: 0.41 };
  for (const [key, value] of Object.entries(entries)) set('Character', 'Parry', key, value);
  assert.equal(await saved('Character', 'Parry', 'ParryUpTime'), 0);
  assert.equal(await saved('Character', 'Parry', 'ExperimentalParry'), false);

  const wireValues = (values: Record<string, number | boolean>) => Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === 'boolean' ? (value ? 'True' : 'False') : value.toFixed(2)]),
  );
  const batch = await apply();
  assert.equal(categoryCommands(batch).length, 1, 'all saved base and feature keys are in the one Parry command');
  assert.deepEqual(categoryEntries(batch, 'Character', 'Parry'), wireValues(entries), 'base rules coexist with stored, disabled feature settings');
});
console.log('PASS: 10 base parry controls survive the editor and Apply, zero and independent feature coexistence');
