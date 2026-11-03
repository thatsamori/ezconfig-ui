// All ten base parry keys beside TrueCombo and ExperimentalParry, through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('parry-combined', async ({ set, reset, saved, apply }) => {
  const { BASE_PARRY_CONFIG_OPTIONS } = await import('../../src/lib/config/baseParryConfigSchema');
  const base = Object.fromEntries(BASE_PARRY_CONFIG_OPTIONS.map((entry, index) => [entry.configKey, index / 10]));
  assert.equal(Object.keys(base).length, 10);
  const entries = { ...base, TrueCombo: true, TrueComboRecoveryTime: .73, TrueComboStamina: -17,
    ExperimentalParry: false, ExperimentalParryDuration: .27 };
  const wire = (values: Record<string, number | boolean>) => Object.fromEntries(Object.entries(values).map(([key, value]) =>
    [key, typeof value === 'boolean' ? (value ? 'True' : 'False') : value.toFixed(2)]));
  for (const [key, value] of Object.entries(entries)) set('Character', 'Parry', key, value);
  assert.equal(await saved('Character', 'Parry', BASE_PARRY_CONFIG_OPTIONS[0].configKey), 0);
  const batch = await apply();
  assert.equal(categoryCommands(batch).length, 1, 'every key is in the one Parry command');
  assert.deepEqual(categoryEntries(batch, 'Character', 'Parry'), wire(entries));

  // Reset one base override while keeping its siblings and feature settings.
  const resetKey = BASE_PARRY_CONFIG_OPTIONS[0].configKey;
  reset('Character', 'Parry', resetKey);
  assert.equal(await saved('Character', 'Parry', resetKey), undefined);
  const remaining = Object.fromEntries(Object.entries(entries).filter(([key]) => key !== resetKey));
  const afterReset = categoryEntries(await apply(), 'Character', 'Parry');
  assert.deepEqual(afterReset, wire(remaining));
  assert.equal(Object.keys(afterReset!).filter(key => Object.hasOwn(base, key)).length, 9);
});
console.log('PASS: all ten base keys coexist with TrueCombo and ExperimentalParry through the editor and Apply; zero and Reset after a wipe preserved');
