import { describe, expect, test } from 'bun:test';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { WEAPON_CONFIG_OPTIONS, CategoryName, WeaponConfigGroupName } from '../src/lib/config/weaponConfigSchema';
import { defaultDetails, defaultLabel, formatDefaultValue, lookupDefault, resolveDefault } from '../src/lib/config/defaults';
import { DataType, type ConfigEntry, type DefaultValue } from '../src/lib/config/types';
import snapshot from '../src/lib/config/gameDefaults.json';

function checkType(entry: ConfigEntry, value: DefaultValue | undefined) {
  expect(value).toBeDefined();
  switch (entry.dataType) {
    case DataType.Bool: expect(typeof value).toBe('boolean'); break;
    case DataType.Float: expect(typeof value).toBe('number'); expect(Number.isFinite(value)).toBe(true); break;
    case DataType.String: expect(typeof value).toBe('string'); if (entry.choices) expect(entry.choices).toContain(value as string); break;
    case DataType.FloatArray:
      expect(Array.isArray(value)).toBe(true);
      expect((value as number[]).every(Number.isFinite)).toBe(true);
      break;
    default:
      expect(Object.keys(value as object).sort()).toEqual(entry.dataType === DataType.Vector ? ['x', 'y', 'z'] : ['x', 'y']);
      expect(Object.values(value as object).every(Number.isFinite)).toBe(true);
  }
}

describe('verified default coverage', () => {
  test('every character option has a typed actual value or documented variants', () => {
    for (const entry of Object.values(CHARACTER_CONFIG_OPTIONS).flat()) {
      const resolved = resolveDefault(entry);
      if (resolved.defaultVariants) {
        expect(resolved.defaultValue).toBeUndefined();
        expect(resolved.defaultVariants.length).toBeGreaterThan(1);
        for (const variant of resolved.defaultVariants) {
          expect(variant.contexts.length).toBeGreaterThan(0);
          checkType(entry, variant.value);
        }
      } else checkType(entry, resolved.defaultValue);
    }
  });
  test('every weapon and attack mode has every schema field, including false and zero', () => {
    expect(Object.keys(snapshot.weapons).sort()).toEqual(Object.values(CategoryName).sort());
    for (const weapon of Object.values(CategoryName)) {
      for (const group of Object.values(WeaponConfigGroupName)) {
        for (const entry of WEAPON_CONFIG_OPTIONS[group === 'General' ? 'General' : 'Attack']) {
          const resolved = resolveDefault(entry, weapon, group);
          checkType(entry, resolved.defaultValue);
          expect(lookupDefault(weapon, group, entry.configKey)).toEqual(resolved);
        }
      }
    }
  });
  test('weapon and alternate mode values are not replaced by generic seeds', () => {
    const entry = WEAPON_CONFIG_OPTIONS.Attack.find(entry => entry.configKey === 'Windup')!;
    expect(resolveDefault(entry, 'Greatsword', 'Strike').defaultValue).toBe(0.575);
    expect(resolveDefault(entry, 'ArmingSword', 'Strike').defaultValue).toBe(0.475);
    expect(resolveDefault(entry, 'ArmingSword', 'AltStrike').defaultValue).toBe(0.4);
    expect(resolveDefault(entry, 'Dagger', 'Strike').defaultValue).not.toBe(0.575);
    expect(resolveDefault(entry, 'Weapon/Greatsword', 'Strike')).toEqual({ defaultValue: 0.575 });
    expect(defaultLabel(entry, 'Unknown', 'Strike')).toBe('Default unavailable');
  });
  test('motion variants come from referenced runtime profiles, never unused SDK tests', () => {
    expect(snapshot.sources.attackMotions.length).toBeGreaterThan(0);
    expect(snapshot.sources.attackMotions.some(path => /Test|NoMissCombo/.test(path))).toBe(false);
    const entry = lookupDefault('Character', 'Parry', 'RiposteWindowBase');
    expect(defaultLabel(entry)).toBe('Default: 0.1 / 0.3 (varies)');
    expect(defaultDetails(entry)).toContain('Horde');
    expect(entry.defaultValue).toBeUndefined();
  });
  test('zero, false, negative, vectors, strings and arrays remain readable', () => {
    expect(defaultLabel({ defaultValue: false })).toBe('Default: false');
    expect(defaultLabel({ defaultValue: 0 })).toBe('Default: 0');
    expect(defaultLabel({ defaultValue: -1 })).toBe('Default: -1');
    expect(formatDefaultValue([75, 65, 43, 38])).toBe('[75, 65, 43, 38]');
    expect(formatDefaultValue({ x: 150, y: 150 })).toBe('X 150 · Y 150');
    expect(formatDefaultValue('Default')).toBe('Default');
    expect(formatDefaultValue([])).toBe('[]');
  });
});
