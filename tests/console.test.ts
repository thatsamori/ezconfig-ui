import { describe, expect, test } from 'bun:test';
import { countOverrides, sweepValue, toggleAttackGroup } from '../src/components/console/model';
import { parrySections } from '../src/components/console/parry-sections';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { DataType } from '../src/lib/config/types';
describe('attack columns', () => {
  test('General is exclusive and attacks keep schema order', () => {
    expect(toggleAttackGroup(['Strike', 'Stab'], 'General')).toEqual(['General']);
    expect(toggleAttackGroup(['General'], 'Stab')).toEqual(['Stab']);
    expect(toggleAttackGroup(['Stab'], 'Strike')).toEqual(['Strike', 'Stab']);
    expect(toggleAttackGroup(['Strike'], 'Strike')).toEqual(['Strike']);
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
