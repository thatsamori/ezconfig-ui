// Equipped subsprint bonuses through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('movement-equipment', async ({ set, reset, saved, apply }) => {
  const fields = { SubSprintSpeedBonusEquipped: 0, SecondSubSprintSpeedBonusEquipped: -75.5 };
  const adjacent = { SprintModifier: '1.90', TimeToMaxSprint: '0.80', MaxWalkSpeedCrouched: '90.00' };
  const formatted = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.toFixed(2)]));
  const movement = async () => categoryEntries(await apply(), 'Character', 'Movement');
  set('Character', 'Movement', 'SprintModifier', 1.9);
  set('Character', 'Movement', 'TimeToMaxSprint', .8);
  set('Character', 'Movement', 'MaxWalkSpeedCrouched', 90);
  set('Character', 'Recovery', 'WorldRecoveryTime', .8);
  assert.deepEqual(await movement(), adjacent, 'without an edit there is no equipment override to send');

  for (const entries of [Object.entries(fields), Object.entries(fields).reverse()]) {
    for (const key of Object.keys(fields)) reset('Character', 'Movement', key);
    for (const [key, value] of entries) set('Character', 'Movement', key, value);
    assert.deepEqual(await movement(), { ...adjacent, ...formatted }, 'main and alternate inputs do not depend on insertion order');
  }
  for (const key of Object.keys(fields)) {
    for (const value of [0, -125, 80.5]) {
      set('Character', 'Movement', key, value);
      assert.equal(await saved('Character', 'Movement', key), value);
      assert.deepEqual(await movement(), { ...adjacent, ...formatted, [key]: value.toFixed(2) }, 'one mode changes without its sibling or the sprint values');
    }
    set('Character', 'Movement', key, fields[key as keyof typeof fields]);
  }

  // Reset of one mode keeps its sibling, including an explicit zero; the wipe clears its earlier server state.
  for (const [removed, retained] of [
    ['SubSprintSpeedBonusEquipped', 'SecondSubSprintSpeedBonusEquipped'],
    ['SecondSubSprintSpeedBonusEquipped', 'SubSprintSpeedBonusEquipped'],
  ]) {
    for (const [key, value] of Object.entries(fields)) set('Character', 'Movement', key, value);
    reset('Character', 'Movement', removed);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', 'Movement'), { ...adjacent, [retained]: formatted[retained] });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Recovery'), { WorldRecoveryTime: '0.80' });
  }
  for (const key of Object.keys(fields)) reset('Character', 'Movement', key);
  const cleared = await apply();
  assert.deepEqual(categoryEntries(cleared, 'Character', 'Movement'), adjacent);
  assert.equal(categoryCommands(cleared).length, 2);
});
console.log('PASS: independent main/alternate equipment subsprint values, signed/zero/order, partial Reset after a wipe and existing sprint/crouch/Recovery');
