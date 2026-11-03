// Checks the feature review harness itself, through the interface fixtures use.
import assert from 'node:assert/strict';
import { categoryEntries, featureReview, WIPE } from './feature-review-harness';

// Category order after the wipe follows storage, so compare it as a set.
const categories = (batch: string[]) => { assert.equal(batch[0], WIPE); return batch.slice(1).sort(); };

await featureReview('harness-check', async ({ set, reset, saved, saveUnchecked, storeUnvalidated, apply, delivered }) => {
  const { DATABASES_PATH, PRESETS_PATH, NOTES_PATH, USERS_PATH, RCON_HOST } = process.env;
  console.log('STORAGE ' + JSON.stringify({ DATABASES_PATH, PRESETS_PATH, NOTES_PATH, USERS_PATH, RCON_HOST }));
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
  assert.deepEqual(categories(batch), [
    'string ezconfig ArmingSword Strike {"Windup":"0.50"}',
    'string ezconfig Character Movement {"MaxWalkSpeed":"450.00","TimeToMaxSprint":"0.96"}',
    'string ezconfig Character Parry {"ParryUpTime":"0.31"}',
  ]);
  assert.deepEqual(categoryEntries(batch, 'Character', 'Movement'), { MaxWalkSpeed: '450.00', TimeToMaxSprint: '0.96' });
  assert.deepEqual(categoryEntries(batch, 'ArmingSword', 'Strike'), { Windup: '0.50' });
  assert.equal(categoryEntries(batch, 'Character', 'Stun'), undefined);

  reset('Character', 'Movement', 'MaxWalkSpeed');
  reset('Character', 'Parry', 'ParryUpTime');
  assert.equal(await saved('Character', 'Movement', 'MaxWalkSpeed'), undefined);
  assert.deepEqual(categories(await apply()), [
    'string ezconfig ArmingSword Strike {"Windup":"0.50"}',
    'string ezconfig Character Movement {"TimeToMaxSprint":"0.96"}',
  ], 'a reset key is not sent, and an emptied category sends no command');

  reset('Character', 'Movement', 'TimeToMaxSprint');
  reset('ArmingSword', 'Strike', 'Windup');

  // An edit the editor or the server refuses is not saved.
  const key = 'OutOfStaminaStunDuration';
  set('Character', 'Stun', key, 0.6);
  set('Character', 'Stun', key, -1);
  assert.equal(await saved('Character', 'Stun', key), 0.6);
  assert.equal(await saveUnchecked('Character', 'Stun', { [key]: -1 }), 400);
  assert.equal(await saved('Character', 'Stun', key), 0.6);
  // A stored value the schema does not accept refuses Apply before anything is delivered or captured.
  await storeUnvalidated('Character', 'Stun', { [key]: 1e40 });
  const count = delivered.length;
  await assert.rejects(apply('invalid'), /Apply was refused/);
  assert.equal(delivered.length, count);
  reset('Character', 'Stun', key);
  assert.deepEqual(await apply('cleared'), [WIPE]);
}, { capture: process.env.EZ_HARNESS_CHECK_CAPTURE_PATH });

await assert.rejects(featureReview('again', async () => {}), /one feature review per process/);
console.log('PASS: feature review harness');
