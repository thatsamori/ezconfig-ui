import { describe, expect, test } from 'bun:test';
import { countOverrides, sweepValue, toggleAttackGroup } from '../src/components/console/model';
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
