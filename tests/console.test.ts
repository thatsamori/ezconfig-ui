import { describe, expect, test } from 'bun:test';
import { countOverrides, holdNumberForWheel, newValueError, newValueOutcome, sweepValue, toggleAttackGroup, valueFromDefault } from '../src/components/console/model';
import { parrySections } from '../src/components/console/parry-sections';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { WEAPON_CONFIG_OPTIONS, WeaponConfigGroupName } from '../src/lib/config/weaponConfigSchema';
import { resolveDefault } from '../src/lib/config/defaults';
import { DataType, type ConfigEntry } from '../src/lib/config/types';
describe('attack columns', () => {
  test('General is exclusive and attacks keep schema order', () => {
    expect(toggleAttackGroup(['Strike', 'Stab'], 'General')).toEqual(['General']);
    expect(toggleAttackGroup(['General'], 'Stab')).toEqual(['Stab']);
    expect(toggleAttackGroup(['Stab'], 'Strike')).toEqual(['Strike', 'Stab']);
    expect(toggleAttackGroup(['Strike'], 'Strike')).toEqual(['Strike']);
  });
});
describe('one click on a default (online-platform#52)', () => {
  const characterEntries = Object.values(CHARACTER_CONFIG_OPTIONS).flat();
  const character = (configKey: string) => characterEntries.find(entry => entry.configKey === configKey)!;
  const weapon = (configKey: string) => Object.values(WEAPON_CONFIG_OPTIONS).flat().find(entry => entry.configKey === configKey)!;
  const clicked = (entry: ConfigEntry, database?: string, category?: string) => valueFromDefault(resolveDefault(entry, database, category).defaultValue, entry);
  test('a Bool takes the opposite of its default', () => {
    expect(clicked(character('CustomFOV'))).toBe(true);
    expect(clicked(character('AllowDrop'))).toBe(false);
    expect(clicked(weapon('NoFlinch'), 'ArmingSword', 'Strike')).toBe(true);
    expect(clicked(weapon('CanMissCombo'), 'ArmingSword', 'Strike')).toBe(false);
    expect(clicked(weapon('CanBlock'), 'ArmingSword', 'General')).toBe(false);
  });
  test('every Bool with one default ends up different from it, so the override is a change', () => {
    const bools = characterEntries.filter(entry => entry.dataType === DataType.Bool);
    expect(bools.length).toBeGreaterThan(0);
    for (const entry of bools) expect(clicked(entry), entry.configKey).toBe(!resolveDefault(entry).defaultValue);
    for (const [general, entries] of [[true, WEAPON_CONFIG_OPTIONS.General], [false, WEAPON_CONFIG_OPTIONS.Attack]] as const) {
      for (const entry of entries.filter(entry => entry.dataType === DataType.Bool)) {
        for (const group of general ? ['General'] : Object.values(WeaponConfigGroupName).filter(group => group !== 'General')) {
          const baseline = resolveDefault(entry, 'ArmingSword', group).defaultValue;
          if (baseline !== undefined) expect(clicked(entry, 'ArmingSword', group), `${entry.configKey} ${group}`).toBe(!baseline);
        }
      }
    }
  });
  test('the All weapons sheet names no weapon: the same rule, with `true` where the default varies', () => {
    expect(resolveDefault(weapon('NoFlinch')).defaultValue).toBe(false);
    expect(clicked(weapon('NoFlinch'))).toBe(true);
    expect(resolveDefault(weapon('CanMissCombo')).defaultValue).toBe(true);
    expect(clicked(weapon('CanMissCombo'))).toBe(false);
    expect(resolveDefault(weapon('CanCombo')).defaultValue).toBeUndefined();
    expect(clicked(weapon('CanCombo'))).toBe(true);
    expect(resolveDefault(weapon('ForcesRearingFromFront')).defaultValue).toBeUndefined();
    expect(clicked(weapon('ForcesRearingFromFront'))).toBe(true);
  });
  test('a Bool with no default sets true', () => {
    expect(valueFromDefault(undefined, character('CustomFOV'))).toBe(true);
  });
  test('string choices, vectors and arrays start from a copy of the default', () => {
    const vector = { x: 1, y: 2, z: 3 };
    const seeded = valueFromDefault(vector, character('HighBlockColliderRelativeOffsetLocation'));
    expect(seeded).toEqual(vector);
    expect(seeded).not.toBe(vector);
    const array = [50, 45];
    const seededArray = valueFromDefault(array, weapon('Damage'));
    expect(seededArray).toEqual(array);
    expect(seededArray).not.toBe(array);
    expect(valueFromDefault({ x: 3, y: 4 }, weapon('Turncap'))).toEqual({ x: 3, y: 4 });
    expect(valueFromDefault('Other', { ...weapon('Damage'), dataType: DataType.String, choices: ['Default', 'Other'] })).toBe('Other');
  });
  test('and with no default, as they did', () => {
    expect(valueFromDefault(undefined, weapon('Damage'))).toEqual([]);
    expect(valueFromDefault(undefined, character('HighBlockColliderRelativeOffsetLocation'))).toEqual({ x: 0, y: 0, z: 0 });
    expect(valueFromDefault(undefined, weapon('Turncap'))).toEqual({ x: 0, y: 0 });
    expect(valueFromDefault(undefined, { ...weapon('Damage'), dataType: DataType.String, choices: ['Default', 'Other'] })).toBe('Default');
    expect(valueFromDefault(undefined, { ...weapon('Damage'), dataType: DataType.String, choices: undefined })).toBe('');
  });
});
describe('the wheel over a number input (online-platform#50)', () => {
  const input = (type: string, focused: boolean, readOnly = false) => ({ type, readOnly, matches: (selector: string) => selector === ':focus' && focused });
  const wheelOver = (target: unknown) => holdNumberForWheel({ target: target as EventTarget });
  const handled = () => new Promise(resolve => setTimeout(resolve));
  test('a focused number input is read-only while the wheel event is handled, then editable again', async () => {
    const focused = input('number', true);
    wheelOver(focused);
    expect(focused.readOnly).toBe(true);
    wheelOver(focused);
    await handled();
    expect(focused.readOnly).toBe(false);
  });
  test('anything else is left as it is', async () => {
    const others = [input('number', false), input('text', true), { tagName: 'DIV' }];
    for (const other of others) wheelOver(other);
    wheelOver(null);
    const alreadyReadOnly = input('number', true, true);
    wheelOver(alreadyReadOnly);
    await handled();
    expect(others.map(other => 'readOnly' in other && other.readOnly)).toEqual([false, false, false]);
    expect(alreadyReadOnly.readOnly).toBe(true);
  });
});
describe("A Float cell's new value", () => {
  const key = (configKey: string) => Object.values(CHARACTER_CONFIG_OPTIONS).flat().find(entry => entry.configKey === configKey)!;
  const sprint = key('PartialSprintModifier');
  const fov = key('CustomFOVMax');
  test("Movement's default is the seed, so blur leaves no override and Enter saves it", () => {
    const baseline = resolveDefault(sprint).defaultValue;
    expect(baseline).toBe(1.175);
    expect(newValueOutcome(String(baseline), baseline, sprint, false)).toBe('close');
    expect(newValueOutcome(String(baseline), baseline, sprint, true)).toBe(1.175);
    expect(newValueOutcome('1.1750', baseline, sprint, false)).toBe('close');
  });
  test('blur and Enter both save a change, zero and negative values too', () => {
    for (const deliberate of [false, true]) {
      expect(newValueOutcome('1.3', 1.175, sprint, deliberate)).toBe(1.3);
      expect(newValueOutcome('0', 1.175, sprint, deliberate)).toBe(0);
      expect(newValueOutcome('-2', 1.175, sprint, deliberate)).toBe(-2);
    }
  });
  test('empty text saves nothing, on a cell with no single default too', () => {
    for (const entry of [sprint, fov]) for (const deliberate of [false, true]) {
      expect(newValueOutcome('', undefined, entry, deliberate)).toBe('close');
      expect(newValueOutcome('', 120, entry, deliberate)).toBe('close');
    }
    expect(newValueError('', fov)).toBeUndefined();
  });
  test('with no single default, any value is a change', () => {
    expect(newValueOutcome('0.5', undefined, sprint, false)).toBe(0.5);
  });
  test("a value outside a key's range stays open with its message, on blur and Enter", () => {
    for (const deliberate of [false, true]) {
      expect(newValueOutcome('500', 120, fov, deliberate)).toBe('refused');
      expect(newValueOutcome('120.5', 120, fov, deliberate)).toBe('refused');
    }
    expect(newValueError('500', fov)).toBe('Use a finite value from 101 to 179.');
    expect(newValueError('120.5', fov)).toBe('Use a whole number.');
    expect(newValueError('130', fov)).toBeUndefined();
    expect(newValueOutcome('130', 120, fov, false)).toBe(130);
  });
  test("no ranged key's default is one its own range refuses, so opening one shows no message", () => {
    const ranged: ConfigEntry[] = Object.values(CHARACTER_CONFIG_OPTIONS).flat().filter(entry => entry.dataType === DataType.Float && entry.minimum !== undefined);
    expect(ranged.length).toBeGreaterThan(0);
    for (const entry of ranged) {
      const baseline = resolveDefault(entry).defaultValue;
      if (typeof baseline === 'number') expect(newValueError(String(baseline), entry), entry.configKey).toBeUndefined();
    }
  });
});
describe('Sweep calculations', () => {
  test('unknown game defaults are never inferred for relative edits', () => {
    expect(sweepValue(undefined, 'multiply', 0.9)).toBeUndefined();
    expect(sweepValue(undefined, 'add', 0.05)).toBeUndefined();
    expect(sweepValue(undefined, 'multiply', 0.9, 0.5)).toBe(0.45);
    expect(sweepValue(0, 'add', 0.05, 2)).toBe(0.05);
  });
  test('Set supports false, zero, strings, vectors and arrays', () => {
    for (const value of [false, 0, 'None', {
      x: 0,
      y: 1
    }, [0, 1]]) expect(sweepValue(undefined, 'set', value)).toEqual(value);
  });
  test('rounds arithmetic noise and rejects overflow', () => {
    expect(sweepValue(0.1, 'add', 0.2)).toBe(0.3);
    expect(sweepValue(1e308, 'multiply', 1e308)).toBeUndefined();
  });
});
describe('override counts', () => {
  test('counts overrides including false and zero, excluding tombstones', () => expect(countOverrides({
    character: {
      Movement: {
        CanDodge: false
      }
    },
    weapons: {
      ArmingSword: {
        Strike: {
          Windup: 0,
          Release: null
        }
      }
    }
  })).toBe(2));
});
describe('Parry sections', () => {
  test('they retain geometry types, feature dependencies and every key exactly once', () => {
    const sections = parrySections(CHARACTER_CONFIG_OPTIONS.Parry);
    expect(sections.map(section => section.title)).toEqual(['Timing and recovery', 'Angles and geometry', 'Features']);
    const geometry = sections[1].entries;
    // The six block collider transforms, which older schemas kept in Combat.
    for (const key of ['LowBlockColliderRelativeOffsetLocation', 'LowBlockColliderRelativeOffsetRotation', 'LowBlockColliderRelativeOffsetScale', 'HighBlockColliderRelativeOffsetLocation', 'HighBlockColliderRelativeOffsetRotation', 'HighBlockColliderRelativeOffsetScale']) {
      expect(CHARACTER_CONFIG_OPTIONS.Combat.some(entry => entry.configKey === key)).toBe(false);
      expect(geometry.find(entry => entry.configKey === key)?.dataType).toBe(DataType.Vector);
    }
    expect(geometry.find(entry => entry.configKey === 'MaxParryAngle')).toBeDefined();
    expect(sections[0].entries.find(entry => entry.configKey === 'ParryUpTime')).toBeDefined();
    expect(sections[2].entries.find(entry => entry.configKey === 'TrueComboStamina')?.gatedBy).toBe('TrueCombo');
    expect(sections.flatMap(section => section.entries)).toHaveLength(CHARACTER_CONFIG_OPTIONS.Parry.length);
  });
});
