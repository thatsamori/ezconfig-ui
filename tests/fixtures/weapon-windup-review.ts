// The four logical Windup categories through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { lookupDefault } from '../../src/lib/config/defaults';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

const categories = ['Strike', 'AltStrike', 'Stab', 'AltStab'];
const values = [0, .72, -.15, .91];
const windup = (category: string, value: number) => `string ezconfig ArmingSword ${category} {"Windup":"${value.toFixed(2)}"}`;
const unrelated = ['string ezconfig Character Movement {"SprintModifier":"1.90"}', 'string ezconfig Greatsword Strike {"Release":"0.80"}'];
const sent = (...windups: string[]) => [...unrelated, ...windups].sort();

await featureReview('weapon-windup', async ({ set, reset, saved, apply }) => {
  set('Greatsword', 'Strike', 'Release', .8);
  set('Character', 'Movement', 'SprintModifier', 1.9);
  assert.deepEqual(categoryCommands(await apply()), sent(), 'without an edit there is no Windup to send');

  // Each category is its own command, whatever order the edits were saved in, zero and negative included.
  for (const order of [categories, [...categories].reverse()]) {
    for (const category of categories) reset('ArmingSword', category, 'Windup');
    for (const category of categories) assert.equal(await saved('ArmingSword', category, 'Windup'), undefined);
    for (const category of order) set('ArmingSword', category, 'Windup', values[categories.indexOf(category)]);
    for (const category of categories) assert.equal(await saved('ArmingSword', category, 'Windup'), values[categories.indexOf(category)]);
    assert.deepEqual(categoryCommands(await apply()), sent(...categories.map((category, index) => windup(category, values[index]))));
  }

  // Removing one logical category keeps its siblings and unrelated weapons/Character keys.
  reset('ArmingSword', 'AltStrike', 'Windup');
  const after = await apply();
  assert.equal(categoryEntries(after, 'ArmingSword', 'AltStrike'), undefined);
  assert.deepEqual(categoryCommands(after), sent(windup('Strike', 0), windup('Stab', -.15), windup('AltStab', .91)));
  for (const category of categories) reset('ArmingSword', category, 'Windup');
  assert.deepEqual(categoryCommands(await apply()), sent());
  set('ArmingSword', 'AltStrike', 'Windup', .33);
  assert.deepEqual(categoryCommands(await apply()), sent(windup('AltStrike', .33)));

  // Actual-default metadata remains weapon/mode specific after explicit reset.
  assert.deepEqual(lookupDefault('Weapon/ArmingSword', 'Strike', 'Windup').defaultValue, .475);
  assert.deepEqual(lookupDefault('Weapon/ArmingSword', 'AltStrike', 'Windup').defaultValue, .4);
});
console.log('PASS: four Windup categories, persisted zero/negative/order, removal/reapply after a wipe and mode defaults');
