// Typed Attack controls through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { lookupDefault } from '../../src/lib/config/defaults';
import { categoryEntries, featureReview } from './feature-review-harness';

const values = {
  Strike: { HitKnockbackFactor: 0, CanCombo: false, Damage: [12, 34, 56, 78], FeintCost: -2.7, Turncap: { x: 27, y: 31 } },
  AltStrike: { HitKnockbackFactor: 2.5, CanCombo: true, Damage: [90, 80, 70, 60] },
  Stab: { Release: .31, HeadBonus: [1, 1.1, 1.2, 1.3] },
  AltStab: { Release: .72, LegBonus: [.7, .8, .9, 1] },
};
const expected = {
  Strike: { HitKnockbackFactor: '0.00', CanCombo: 'False', Damage: '12.00,34.00,56.00,78.00', FeintCost: '-2.70', Turncap: 'X=27.00,Y=31.00,Z=0.00' },
  AltStrike: { HitKnockbackFactor: '2.50', CanCombo: 'True', Damage: '90.00,80.00,70.00,60.00' },
  Stab: { Release: '0.31', HeadBonus: '1.00,1.10,1.20,1.30' },
  AltStab: { Release: '0.72', LegBonus: '0.70,0.80,0.90,1.00' },
};

await featureReview('weapon-attack', async ({ set, reset, apply }) => {
  set('Character', 'Movement', 'SprintModifier', 1.9);
  set('Greatsword', 'Strike', 'Damage', [80, 70, 60, 50]);
  for (const [category, fields] of Object.entries(values)) for (const [key, value] of Object.entries(fields)) set('ArmingSword', category, key, value);
  const initial = await apply('initial');
  for (const [category, entries] of Object.entries(expected)) assert.deepEqual(categoryEntries(initial, 'ArmingSword', category), entries);

  // Reset removes only its key: the other attack categories, the other weapon and Character keep theirs.
  reset('ArmingSword', 'Strike', 'HitKnockbackFactor');
  reset('ArmingSword', 'AltStrike', 'Damage');
  const afterRemoval = await apply('afterRemoval');
  assert.deepEqual(categoryEntries(afterRemoval, 'ArmingSword', 'Strike'), { CanCombo: 'False', Damage: '12.00,34.00,56.00,78.00', FeintCost: '-2.70', Turncap: 'X=27.00,Y=31.00,Z=0.00' });
  assert.deepEqual(categoryEntries(afterRemoval, 'ArmingSword', 'AltStrike'), { HitKnockbackFactor: '2.50', CanCombo: 'True' });
  assert.deepEqual(categoryEntries(afterRemoval, 'ArmingSword', 'Stab'), expected.Stab);
  assert.deepEqual(categoryEntries(afterRemoval, 'ArmingSword', 'AltStab'), expected.AltStab);
  assert.deepEqual(categoryEntries(afterRemoval, 'Greatsword', 'Strike'), { Damage: '80.00,70.00,60.00,50.00' });
  assert.deepEqual(categoryEntries(afterRemoval, 'Character', 'Movement'), { SprintModifier: '1.90' });

  assert.equal(typeof lookupDefault('Weapon/ArmingSword', 'Strike', 'HitKnockbackFactor').defaultValue, 'number');
  assert(Array.isArray(lookupDefault('Weapon/ArmingSword', 'AltStrike', 'Damage').defaultValue));
}, { capture: process.env.EZ_WEAPON_CAPTURE_PATH });
console.log('PASS: public knockback spelling, typed arrays/bools/int-input/vector, persistence, independent categories, reset after a wipe and actual defaults');
