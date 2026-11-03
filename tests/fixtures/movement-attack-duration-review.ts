// Attack supersprint durations through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

await featureReview('movement-attack-duration', async ({ set, reset, saved, apply }) => {
  const fields = { AttackSupersprintDuration: 0, SecondAttackSupersprintDuration: -.25 };
  const keys = Object.keys(fields);
  const adjacent = { SupersprintModifier: '2.30', SprintAcceleration: '200.00', TimeToMaxSprint: '0.80', SubSprintSpeedBonusEquipped: '-0.20' };
  const formatted = { AttackSupersprintDuration: '0.00', SecondAttackSupersprintDuration: '-0.25' };
  const movement = async () => categoryEntries(await apply(), 'Character', 'Movement');
  set('Character', 'Movement', 'SupersprintModifier', 2.3);
  set('Character', 'Movement', 'SprintAcceleration', 200);
  set('Character', 'Movement', 'TimeToMaxSprint', .8);
  set('Character', 'Movement', 'SubSprintSpeedBonusEquipped', -.2);
  set('Character', 'Recovery', 'WorldRecoveryTime', .8);
  assert.deepEqual(await movement(), adjacent, 'absent durations send no override');

  for (const entries of [Object.entries(fields), Object.entries(fields).reverse()]) {
    for (const key of keys) reset('Character', 'Movement', key);
    for (const [key, value] of entries) set('Character', 'Movement', key, value);
    assert.deepEqual(await movement(), { ...adjacent, ...formatted }, 'logical mode values are independent of insertion order');
  }
  const current: Record<string, string> = { ...formatted };
  for (const key of keys) {
    for (const value of [0, -.25, .45]) {
      set('Character', 'Movement', key, value);
      assert.equal(await saved('Character', 'Movement', key), value);
      current[key] = value.toFixed(2);
      assert.deepEqual(await movement(), { ...adjacent, ...current }, 'one mode sends its literal signed/zero value without changing its sibling');
    }
  }

  // Reset of one mode keeps its sibling, including an explicit zero; the wipe clears its earlier server state.
  for (const [removed, retained] of [
    ['AttackSupersprintDuration', 'SecondAttackSupersprintDuration'],
    ['SecondAttackSupersprintDuration', 'AttackSupersprintDuration'],
  ]) {
    for (const [key, value] of Object.entries(fields)) set('Character', 'Movement', key, value);
    reset('Character', 'Movement', removed);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', 'Movement'), { ...adjacent, [retained]: fields[retained as keyof typeof fields].toFixed(2) });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Recovery'), { WorldRecoveryTime: '0.80' });
  }
  for (const key of keys) reset('Character', 'Movement', key);
  const cleared = await apply();
  assert.deepEqual(categoryEntries(cleared, 'Character', 'Movement'), adjacent);
  assert.equal(categoryCommands(cleared).length, 2);
  assert(!cleared.some(command => command.includes('AttackSupersprintDuration')));
});
console.log('PASS: independent attack duration modes, literal values and order, Reset after a wipe, existing speed/equipment/Recovery coexistence');
