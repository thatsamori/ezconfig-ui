// All 34 AttackMotion keys through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('attack-motion', async ({ set, saved, apply }) => {
  const { ATTACK_MOTION_CONFIG_OPTIONS } = await import('../../src/lib/config/attackMotionConfigSchema');
  const entries = Object.fromEntries(ATTACK_MOTION_CONFIG_OPTIONS.map(entry =>
    [entry.configKey, entry.dataType === 'Bool' ? false : 0.1234]));
  entries.StrikeFeintWindow = 0;
  for (const [key, value] of Object.entries(entries)) set('Character', 'AttackMotion', key, value);
  assert.equal(await saved('Character', 'AttackMotion', 'StrikeFeintWindow'), 0);
  assert.equal(await saved('Character', 'AttackMotion', 'DisableStrikeEndReleaseGlances'), false);
  const batch = await apply();
  assert.equal(categoryCommands(batch).length, 1, 'every key is in the one AttackMotion command');
  const sent = categoryEntries(batch, 'Character', 'AttackMotion')!;
  assert.equal(Object.keys(sent).length, 34, 'saved AttackMotion keys must all be sent');
  assert.equal(sent.StrikeFeintWindow, '0.00');
  assert.equal(sent.DisableStrikeEndReleaseGlances, 'False');
});
console.log('PASS: 34 saved AttackMotion keys reach the editor and Apply, including 0 and false');
