// All Movement additions together through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

// Totals derived from the published string schemas, so adding a key does not require editing this fixture.
const publishedKeyCount = async (file: string) => (await readFile(join(import.meta.dir, '..', '..', 'string-schemas', file), 'utf8')).trim().split(/\s+/).length;
const publishedCharacterKeyCount = await publishedKeyCount('characterConfigSchema.txt');
const publishedWeaponKeyCount = await publishedKeyCount('weaponConfigSchema.txt');

await featureReview('movement-combined', async ({ set, reset, saved, apply }) => {
  const { CHARACTER_CONFIG_OPTIONS } = await import('../../src/lib/config/characterConfigSchema');
  const { WEAPON_CONFIG_OPTIONS } = await import('../../src/lib/config/weaponConfigSchema');
  const { MOVEMENT_CONFIG_OPTIONS } = await import('../../src/lib/config/movementConfigSchema');
  const { STUN_CONFIG_OPTIONS } = await import('../../src/lib/config/stunConfigSchema');
  const { DataType } = await import('../../src/lib/config/types');
  assert.equal(CHARACTER_CONFIG_OPTIONS.Movement.length, 25);
  assert.equal(Object.keys(CHARACTER_CONFIG_OPTIONS).length, 14);
  const characterEntries = Object.values(CHARACTER_CONFIG_OPTIONS).flat();
  assert.equal(characterEntries.length, publishedCharacterKeyCount);
  assert(STUN_CONFIG_OPTIONS.every(stun => characterEntries.some(entry => entry.configKey === stun.configKey)));
  assert.equal(Object.values(WEAPON_CONFIG_OPTIONS).flat().length, publishedWeaponKeyCount);
  assert.equal(new Set(characterEntries.map(entry => entry.configKey)).size, characterEntries.length);

  const values = {
    MaxWalkSpeed: 450,
    MaxWalkSpeedCrouched: 0,
    MaxWalkSpeedCrouchedWithRatPerk: 296,
    PartialSprintModifier: -.5,
    SprintModifier: 1.9,
    SprintAcceleration: 200,
    SupersprintModifier: 2.3,
    BackpedalModifier: -.2,
    StrafeModifier: .7,
    AttackSupersprintDuration: 0,
    SecondAttackSupersprintDuration: .42,
    SubSprintSpeedBonusEquipped: -.2,
    SecondSubSprintSpeedBonusEquipped: 0,
  };
  const keys = Object.keys(values);
  assert.equal(keys.length, 13);
  assert.deepEqual(MOVEMENT_CONFIG_OPTIONS.map(entry => entry.configKey).sort(), [...keys].sort());
  assert(MOVEMENT_CONFIG_OPTIONS.every(entry => entry.dataType === DataType.Float && entry.isImplemented && entry.requiresExplicitValue && entry.default === undefined));
  const recovery = { WorldRecoveryTime: '0.65' };
  set('Character', 'Movement', 'TimeToMaxSprint', .8);
  set('Character', 'Recovery', 'WorldRecoveryTime', .65);
  assert.deepEqual(categoryEntries(await apply(), 'Character', 'Movement'), { TimeToMaxSprint: '0.80' });

  // Reverse insertion separates transport correctness from the schema's display order.
  for (const [key, value] of Object.entries(values).reverse()) set('Character', 'Movement', key, value);
  for (const [key, value] of Object.entries(values)) assert.equal(await saved('Character', 'Movement', key), value);
  const formatted = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.toFixed(2)]));
  const combined = await apply();
  assert.deepEqual(categoryEntries(combined, 'Character', 'Movement'), { ...formatted, TimeToMaxSprint: '0.80' });
  assert.deepEqual(categoryEntries(combined, 'Character', 'Recovery'), recovery);
  assert.equal(categoryCommands(combined).length, 2);

  // Remove keys from component, crouch and equipment families in the same saved config.
  const removed = ['MaxWalkSpeed', 'MaxWalkSpeedCrouchedWithRatPerk', 'SprintModifier', 'AttackSupersprintDuration', 'SubSprintSpeedBonusEquipped'];
  for (const key of removed) reset('Character', 'Movement', key);
  const retained = Object.fromEntries(Object.entries(formatted).filter(([key]) => !removed.includes(key)));
  const partial = await apply();
  assert.deepEqual(categoryEntries(partial, 'Character', 'Movement'), { ...retained, TimeToMaxSprint: '0.80' });
  assert.deepEqual(categoryEntries(partial, 'Character', 'Recovery'), recovery);
  for (const key of keys) reset('Character', 'Movement', key);
  const cleared = await apply();
  assert.deepEqual(categoryEntries(cleared, 'Character', 'Movement'), { TimeToMaxSprint: '0.80' });
  assert.deepEqual(categoryEntries(cleared, 'Character', 'Recovery'), recovery);
  assert.equal(categoryCommands(cleared).length, 2);

  // Safe native follow-through scenario, captured from the same Apply.
  const gameplayValues = {
    MaxWalkSpeed: 120, MaxWalkSpeedCrouched: 81, MaxWalkSpeedCrouchedWithRatPerk: 163,
    BackpedalModifier: .47, StrafeModifier: .61, PartialSprintModifier: 1.13,
    SprintModifier: 1.83, SprintAcceleration: 800, SupersprintModifier: 1.7,
    SubSprintSpeedBonusEquipped: .12, SecondSubSprintSpeedBonusEquipped: -.04,
    AttackSupersprintDuration: .42, SecondAttackSupersprintDuration: .18, TimeToMaxSprint: .53,
  };
  for (const [key, value] of Object.entries(gameplayValues)) set('Character', 'Movement', key, value);
  const gameplay = await apply();
  assert.deepEqual(categoryEntries(gameplay, 'Character', 'Movement'),
    Object.fromEntries(Object.entries(gameplayValues).map(([key, value]) => [key, value.toFixed(2)])));
  if (process.env.EZCONFIG_CAPTURE_MOVEMENT_COMMANDS === '1') {
    const artifactDirectory = resolve('.scratch/movement-ui');
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, 'ticket06-captured-rcon.json'), JSON.stringify({
      source: "Feature review harness: editor -> Draft -> Apply (whole configuration after a wipe) -> the batch delivered to the game server's held poll",
      movementValues: gameplayValues,
      recoveryValues: { WorldRecoveryTime: .65 },
      commands: gameplay,
    }, null, 2) + '\n', 'utf8');
  }
});
console.log('PASS: 13 combined Movement additions, complete unique schema, signed/zero values, partial/all Reset after a wipe and TimeToMaxSprint/Recovery preservation');
