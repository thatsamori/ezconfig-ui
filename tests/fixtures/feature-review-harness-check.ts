// Checks the feature review harness itself, through the interface fixtures use.
import assert from 'node:assert/strict';
import { categoryCommands, categoryEntries, featureReview, WIPE } from './feature-review-harness';

await featureReview('harness-check', async ({ set, reset, saved, editorValue, saveUnchecked, storeUnvalidated, apply }) => {
  const { env } = await import('../../src/lib/env');
  console.log('STORAGE ' + JSON.stringify({ platform: env.databasePath }));
  assert.deepEqual(await apply('empty'), [WIPE], 'an empty configuration still wipes');

  set('Character', 'Movement', 'MaxWalkSpeed', 450);
  assert.deepEqual(await apply('walk'), [WIPE, 'string ezconfig Character Movement {"MaxWalkSpeed":"450.00"}']);
  await assert.rejects(apply('walk'), /already captured/);

  set('Character', 'Movement', 'TimeToMaxSprint', 0.96);
  set('Character', 'Parry', 'ParryUpTime', 0.31);
  set('ArmingSword', 'Strike', 'Windup', 0.5);
  assert.equal(await saved('Character', 'Movement', 'MaxWalkSpeed'), 450);
  assert.equal(await saved('ArmingSword', 'Strike', 'Windup'), 0.5);
  assert.equal(await saved('Character', 'Movement', 'SprintModifier'), undefined);
  const batch = await apply();
  assert.equal(batch.length, 4, 'the wipe and three categories');
  assert.deepEqual(categoryEntries(batch, 'Character', 'Movement'), { MaxWalkSpeed: '450.00', TimeToMaxSprint: '0.96' });
  assert.deepEqual(categoryEntries(batch, 'Character', 'Parry'), { ParryUpTime: '0.31' });
  assert.deepEqual(categoryEntries(batch, 'ArmingSword', 'Strike'), { Windup: '0.50' });
  assert.equal(categoryEntries(batch, 'Character', 'Stun'), undefined);

  reset('Character', 'Movement', 'MaxWalkSpeed');
  reset('Character', 'Parry', 'ParryUpTime');
  assert.equal(await saved('Character', 'Movement', 'MaxWalkSpeed'), undefined);
  assert.deepEqual(categoryCommands(await apply()), [
    'string ezconfig ArmingSword Strike {"Windup":"0.50"}',
    'string ezconfig Character Movement {"TimeToMaxSprint":"0.96"}',
  ], 'a reset key is not sent, and an emptied category sends no command');

  reset('Character', 'Movement', 'TimeToMaxSprint');
  reset('ArmingSword', 'Strike', 'Windup');

  // An edit the editor or the server refuses is not saved.
  const key = 'OutOfStaminaStunDuration';
  set('Character', 'Stun', key, 0.6);
  set('Character', 'Stun', key, -1);
  assert.equal(editorValue('Character', 'Stun', key), 0.6);
  assert.equal(await saved('Character', 'Stun', key), 0.6);
  assert.equal(await saveUnchecked('Character', 'Stun', { [key]: -1 }), 400);
  assert.equal(await saved('Character', 'Stun', key), 0.6);
  // A stored value the schema does not accept refuses Apply; nothing is delivered or captured.
  await storeUnvalidated('Character', 'Stun', { [key]: 1e40 });
  assert.equal(await saved('Character', 'Stun', key), 1e40);
  await assert.rejects(apply('invalid'), /Apply was refused \(400\)/);
  reset('Character', 'Stun', key);
  assert.deepEqual(await apply('cleared'), [WIPE]);
}, { capture: process.env.EZ_HARNESS_CHECK_CAPTURE_PATH });

await assert.rejects(featureReview('again', async () => {}), /one feature review per process/);
console.log('PASS: feature review harness');
