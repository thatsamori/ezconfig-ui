// Combined Weapon and Movement policy through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryEntries, featureReview } from './feature-review-harness';

const movement = { MaxWalkSpeed: 120, SprintModifier: 1.9, SubSprintSpeedBonusEquipped: 0, SecondSubSprintSpeedBonusEquipped: .25, AttackSupersprintDuration: .43, SecondAttackSupersprintDuration: .19, TimeToMaxSprint: .6 };

await featureReview('weapon-integration', async ({ set, reset, apply }) => {
  set('MeatCleaver', 'Strike', 'Windup', .81);
  set('MeatCleaver', 'Strike', 'Damage', [23, 24, 25, 26]);
  set('MeatCleaver', 'General', 'CanBlock', false);
  set('Polehammer', 'AltStrike', 'Windup', .97);
  set('Polehammer', 'General', 'BlockStaminaNegation', 0);
  set('Polehammer', 'General', 'SecondBlockStaminaNegation', 8.5);
  set('Polehammer', 'General', 'ParryBoxTransformLocation', { x: 17, y: -9, z: 3 });
  set('ArmingSword', 'Strike', 'Release', .28);
  for (const [key, value] of Object.entries(movement)) set('Character', 'Movement', key, value);
  const initial = await apply('initial');
  assert(initial.includes('string ezconfig MeatCleaver General {"CanBlock":"False"}'));
  assert.deepEqual(categoryEntries(initial, 'MeatCleaver', 'Strike'), { Damage: '23.00,24.00,25.00,26.00', Windup: '0.81' });

  set('MeatCleaver', 'Strike', 'Windup', .86);
  set('Character', 'Movement', 'AttackSupersprintDuration', .12);
  const updated = await apply('updated');
  assert.deepEqual(categoryEntries(updated, 'MeatCleaver', 'Strike'), { Damage: '23.00,24.00,25.00,26.00', Windup: '0.86' });
  assert.equal(categoryEntries(updated, 'Character', 'Movement')?.AttackSupersprintDuration, '0.12');

  // Reset removes only its key; explicit false and zero stay.
  reset('MeatCleaver', 'Strike', 'Damage');
  reset('Polehammer', 'General', 'BlockStaminaNegation');
  const afterRemoval = await apply('afterRemoval');
  assert.deepEqual(categoryEntries(afterRemoval, 'MeatCleaver', 'Strike'), { Windup: '0.86' });
  const polehammer = categoryEntries(afterRemoval, 'Polehammer', 'General');
  assert.equal(polehammer?.BlockStaminaNegation, undefined);
  assert.equal(polehammer?.SecondBlockStaminaNegation, '8.50');
  assert(afterRemoval.includes('string ezconfig MeatCleaver General {"CanBlock":"False"}'));
  assert.equal(categoryEntries(afterRemoval, 'Character', 'Movement')?.SubSprintSpeedBonusEquipped, '0.00');
}, { capture: process.env.EZ_WEAPON_CAPTURE_PATH });
console.log('PASS: combined saved Weapon/Movement, independent roster categories, explicit false/zero, updates, array transport, removal and the wipe first');
