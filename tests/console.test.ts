import { describe, expect, test } from 'bun:test';
import { countOverrides, newValueError, newValueOutcome, sweepValue, toggleAttackGroup } from '../src/components/console/model';
import { parrySections } from '../src/components/console/parry-sections';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
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
