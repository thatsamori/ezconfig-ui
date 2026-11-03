// Ticket 03: General controls, ForcesRearingFromFront and weapon lengths through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { lookupDefault } from '../../src/lib/config/defaults';
import { supportsWeapon } from '../../src/lib/config/types';
import { WEAPON_CONFIG_OPTIONS } from '../../src/lib/config/weaponConfigSchema';
import { getSchemaForCategory, validateEntries } from '../../src/lib/database/validation';
import { categoryEntries, featureReview } from './feature-review-harness';

const values = {
  CanBlock: false,
  BlockStaminaNegation: 0,
  SecondBlockStaminaNegation: 17.5,
  BlockStaminaClamp: { x: 0, y: 19 },
  ParryBoxTransformLocation: { x: 11, y: 22, z: 33 },
  ParryBoxTransformRotation: { x: 5, y: 7, z: 9 },
  ParryBoxTransformScale: { x: 1.1, y: 1.2, z: 1.3 },
};
const attackCategories = ['Strike', 'AltStrike', 'Stab', 'AltStab'];
const flag = (value: boolean) => value ? 'True' : 'False';
/** Spear's ForcesRearingFromFront per attack category, each sending only that key; undefined where one is not sent. */
function rearing(batch: readonly string[]) {
  return attackCategories.map(category => {
    const entries = categoryEntries(batch, 'Spear', category);
    if (entries) assert.deepEqual(Object.keys(entries), ['ForcesRearingFromFront']);
    return entries?.ForcesRearingFromFront;
  });
}
/** A weapon's two General lengths as sent; undefined where one is not. */
function lengths(batch: readonly string[], weapon: string) {
  const general = categoryEntries(batch, weapon, 'General');
  return { WeaponLength: general?.WeaponLength, AltWeaponLength: general?.AltWeaponLength };
}
async function writeCapture(variable: string, directory: string, file: string, data: Record<string, unknown>) {
  if (process.env[variable] !== '1') return;
  await mkdir(resolve(directory), { recursive: true });
  await writeFile(join(resolve(directory), file), JSON.stringify({
    source: "Feature review harness: editor -> Draft -> Apply (whole configuration after a wipe) -> the batch delivered to the game server's held poll", ...data,
  }, null, 2) + '\n');
}

await featureReview('weapon-general', async ({ set, reset, saved, editorValue, saveUnchecked, apply }) => {
  for (const [key, value] of Object.entries(values)) {
    assert(lookupDefault('Spear', 'General', key).defaultValue !== undefined);
    set('Spear', 'General', key, value);
  }
  for (const category of attackCategories) {
    assert(lookupDefault('Spear', category, 'ForcesRearingFromFront').defaultValue !== undefined);
    set('Spear', category, 'ForcesRearingFromFront', category !== 'AltStrike');
  }
  const initialCommands = await apply();
  const general = categoryEntries(initialCommands, 'Spear', 'General');
  assert.deepEqual(Object.keys(general ?? {}).sort(), Object.keys(values).sort());
  assert.equal(general?.CanBlock, 'False');
  assert.equal(general?.BlockStaminaNegation, '0.00');
  assert.equal(general?.ParryBoxTransformLocation, 'X=11.00,Y=22.00,Z=33.00');
  assert.equal(general?.ParryBoxTransformRotation, 'X=5.00,Y=7.00,Z=9.00');
  assert.equal(general?.ParryBoxTransformScale, 'X=1.10,Y=1.20,Z=1.30');
  assert.deepEqual(rearing(initialCommands), ['True', 'False', 'True', 'True']);

  // Stab toggles on its own; the other attack categories keep theirs.
  const rearingStages: Record<string, string[]> = {};
  for (const [label, value] of [['enabled', true], ['disabled', false]] as const) {
    set('Spear', 'Stab', 'ForcesRearingFromFront', value);
    rearingStages[label] = await apply();
    assert.deepEqual(rearing(rearingStages[label]), ['True', 'False', flag(value), 'True']);
  }
  // Reset removes one transform and Stab's only key; the other transforms and categories stay.
  reset('Spear', 'General', 'ParryBoxTransformLocation');
  reset('Spear', 'Stab', 'ForcesRearingFromFront');
  const removalCommands = await apply();
  const afterReset = categoryEntries(removalCommands, 'Spear', 'General');
  assert.equal(afterReset?.ParryBoxTransformLocation, undefined);
  assert(afterReset?.ParryBoxTransformRotation && afterReset.ParryBoxTransformScale);
  assert.deepEqual(rearing(removalCommands), ['True', 'False', undefined, 'True']);

  const rearingCategoryBatches: Record<string, string[]> = {};
  for (const [label, value] of [['allTrue', true], ['allFalse', false]] as const) {
    for (const category of attackCategories) set('Spear', category, 'ForcesRearingFromFront', value);
    rearingCategoryBatches[label] = await apply();
    assert.deepEqual(rearing(rearingCategoryBatches[label]), attackCategories.map(() => flag(value)));
  }
  // Each category resets on its own from its non-default value.
  const rearingRemovalBatches: Record<string, { before: string[]; remove: string[] }> = {};
  for (const removedCategory of attackCategories) {
    const flipped = attackCategories.map(category => {
      const baseline = lookupDefault('Spear', category, 'ForcesRearingFromFront').defaultValue;
      assert.equal(typeof baseline, 'boolean');
      set('Spear', category, 'ForcesRearingFromFront', !baseline);
      return flag(!baseline);
    });
    const before = await apply();
    assert.deepEqual(rearing(before), flipped);
    reset('Spear', removedCategory, 'ForcesRearingFromFront');
    const remove = await apply();
    assert.deepEqual(rearing(remove), flipped.map((value, index) => attackCategories[index] === removedCategory ? undefined : value));
    rearingRemovalBatches[removedCategory] = { before, remove };
  }

  const mainEntry = WEAPON_CONFIG_OPTIONS.General.find(entry => entry.configKey === 'WeaponLength')!;
  const altEntry = WEAPON_CONFIG_OPTIONS.General.find(entry => entry.configKey === 'AltWeaponLength')!;
  assert.deepEqual({ label: mainEntry.label, minimum: mainEntry.minimum, maximum: mainEntry.maximum },
    { label: 'Main length (cm)', minimum: 1, maximum: undefined });
  assert.equal(mainEntry.supportedWeapons?.length, 35);
  assert.deepEqual({ label: altEntry.label, minimum: altEntry.minimum, maximum: altEntry.maximum },
    { label: 'Alternate length (cm)', minimum: 1, maximum: undefined });
  assert.equal(altEntry.supportedWeapons?.length, 17);
  assert.equal(lookupDefault('Spear', 'General', 'WeaponLength').defaultValue, 180);
  assert.equal(lookupDefault('Spear', 'General', 'AltWeaponLength').defaultValue, 135);
  assert(getSchemaForCategory('Spear', 'General')?.WeaponLength);
  assert(getSchemaForCategory('Spear', 'General')?.AltWeaponLength);
  assert(getSchemaForCategory('ArmingSword', 'General')?.WeaponLength);
  assert(!getSchemaForCategory('ArmingSword', 'General')?.AltWeaponLength);
  assert.equal(WEAPON_CONFIG_OPTIONS.General.filter(entry => supportsWeapon(entry, 'Spear')).includes(mainEntry), true);
  assert.equal(WEAPON_CONFIG_OPTIONS.General.filter(entry => supportsWeapon(entry, 'ArmingSword')).includes(mainEntry), true);
  assert.equal(WEAPON_CONFIG_OPTIONS.General.filter(entry => supportsWeapon(entry, 'ArmingSword')).includes(altEntry), false);
  assert.equal(validateEntries({ AltWeaponLength: 120 }, 'ArmingSword', 'General').valid, false);

  // The editor refuses an invalid length, so the shown and saved values stay as they were.
  const invalidLengths = [0, 0.999, -1, NaN, Infinity, -Infinity, 1e40];
  for (const [key, retained] of [['WeaponLength', 120.5], ['AltWeaponLength', 90.25]] as const) {
    set('Spear', 'General', key, retained);
    for (const invalid of invalidLengths) {
      assert.equal(validateEntries({ [key]: invalid }, 'Spear', 'General').valid, false);
      set('Spear', 'General', key, invalid);
      assert.equal(editorValue('Spear', 'General', key), retained);
    }
    assert.equal(await saved('Spear', 'General', key), retained);
  }
  assert.equal(await saveUnchecked('Spear', 'General', { WeaponLength: 0 }), 400);
  assert.equal(await saveUnchecked('ArmingSword', 'General', { AltWeaponLength: 120 }), 400);

  // A constrained length is sent as entered, not rounded to two decimals.
  const lengthStages: Record<string, string[]> = {};
  for (const [label, main, alternate] of [
    ['shortenLengthen', 120.5, 240.25],
    ['minimumAndDecimal', 1, 135.75],
    ['largeFiniteIndependent', 3e38, 2.5],
    ['nativeReplay', 240, 90],
  ] as const) {
    set('Spear', 'General', 'WeaponLength', main);
    set('Spear', 'General', 'AltWeaponLength', alternate);
    lengthStages[label] = await apply();
    assert.deepEqual(lengths(lengthStages[label], 'Spear'), { WeaponLength: String(main), AltWeaponLength: String(alternate) });
  }
  reset('Spear', 'General', 'WeaponLength');
  const partialRemove = await apply();
  assert.deepEqual(lengths(partialRemove, 'Spear'), { WeaponLength: undefined, AltWeaponLength: '90' });
  reset('Spear', 'General', 'AltWeaponLength');
  const wipe = await apply();
  assert.deepEqual(lengths(wipe, 'Spear'), { WeaponLength: undefined, AltWeaponLength: undefined });

  // Two weapons' lengths are independent of each other.
  set('Spear', 'General', 'WeaponLength', 210.5);
  set('Spear', 'General', 'AltWeaponLength', 100.25);
  set('Greatsword', 'General', 'WeaponLength', 150.75);
  set('Greatsword', 'General', 'AltWeaponLength', 80.5);
  const twoWeapons = await apply();
  assert.deepEqual(lengths(twoWeapons, 'Spear'), { WeaponLength: '210.5', AltWeaponLength: '100.25' });
  assert.deepEqual(lengths(twoWeapons, 'Greatsword'), { WeaponLength: '150.75', AltWeaponLength: '80.5' });
  reset('Spear', 'General', 'WeaponLength');
  const removeSpearMain = await apply();
  assert.deepEqual(lengths(removeSpearMain, 'Spear'), { WeaponLength: undefined, AltWeaponLength: '100.25' });
  assert.deepEqual(lengths(removeSpearMain, 'Greatsword'), { WeaponLength: '150.75', AltWeaponLength: '80.5' });
  reset('Greatsword', 'General', 'AltWeaponLength');
  const removeGreatswordAlt = await apply();
  assert.deepEqual(lengths(removeGreatswordAlt, 'Spear'), { WeaponLength: undefined, AltWeaponLength: '100.25' });
  assert.deepEqual(lengths(removeGreatswordAlt, 'Greatsword'), { WeaponLength: '150.75', AltWeaponLength: undefined });

  await writeCapture('EZCONFIG_CAPTURE_LENGTH_COMMANDS', '.scratch/weapon-scale-ui', 'ticket02-spear-length-captured-rcon.json', {
    database: 'Spear', category: 'General', defaultsCm: { WeaponLength: 180, AltWeaponLength: 135 },
    stages: lengthStages, partialRemove, wipe,
  });
  await writeCapture('EZCONFIG_CAPTURE_ROSTER_LENGTH_COMMANDS', '.scratch/weapon-scale-ui', 'ticket04-roster-length-captured-rcon.json', {
    databases: ['Spear', 'Greatsword'], category: 'General',
    stages: { twoWeapons, removeSpearMain, removeGreatswordAlt },
  });
  await writeCapture('EZCONFIG_CAPTURE_GENERAL_COMMANDS', '.scratch/weapon-reliability-ui', 'ticket03-captured-rcon.json', {
    initialCommands, removalCommands, rearingStages, rearingCategoryBatches, rearingRemovalBatches, values,
  });
});
console.log('PASS: General scalar/boolean/transform controls and all four ForcesRearingFromFront categories persist/apply/reset with explicit false/zero');
