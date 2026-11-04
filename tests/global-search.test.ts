import { describe, expect, test } from 'bun:test';
import { searchGlobal } from '../src/components/console/search';
import { WEAPON_CONFIG_OPTIONS } from '../src/lib/config/weaponConfigSchema';
import { supportsWeapon } from '../src/lib/config/types';

const context = { weapon: 'ArmingSword' };

describe('global search', () => {
  test('finds character keys outside the active group, ignoring casing and spacing', () => {
    expect(searchGlobal('MAX walk speed', context).results[0]).toMatchObject({
      tab: 'character', group: 'Movement', configKey: 'MaxWalkSpeed',
    });
  });

  test('combines weapon, attack type, and key to resolve the exact destination', () => {
    expect(searchGlobal('great sword stab windup', context).results).toEqual(expect.arrayContaining([
      expect.objectContaining({ weapon: 'Greatsword', group: 'Stab', configKey: 'Windup' }),
    ]));
    expect(searchGlobal('great sword stab windup', context).results.every(result =>
      result.weapon === 'Greatsword' && result.group?.includes('Stab') && result.configKey?.includes('Windup')
    )).toBe(true);
  });

  test('ranks exact matches and the current weapon before other weapon keys', () => {
    const { results } = searchGlobal('windup', context);
    expect(results[0]).toMatchObject({ weapon: 'ArmingSword', configKey: 'Windup' });
    expect(searchGlobal('axe', context).results[0]).toMatchObject({ label: 'Axe', weapon: 'Axe' });
  });

  test('resolves general weapon keys to General instead of an attack category', () => {
    const { results } = searchGlobal('ArmingSword General', context);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(result => result.weapon === 'ArmingSword' && result.group === 'General')).toBe(true);
  });

  test('indexes main length for the roster and alternate length only for native alternate weapons', () => {
    const main = searchGlobal('WeaponLength', context).results;
    expect(main.some(result => result.weapon === 'Spear' && result.configKey === 'WeaponLength')).toBe(true);
    expect(main.some(result => result.weapon === 'ArmingSword' && result.configKey === 'WeaponLength')).toBe(true);
    const alternate = searchGlobal('Alternate length cm', context).results;
    expect(alternate.some(result => result.weapon === 'Spear' && result.configKey === 'AltWeaponLength')).toBe(true);
    expect(alternate.some(result => result.weapon === 'Greatsword' && result.configKey === 'AltWeaponLength')).toBe(true);
    expect(alternate.some(result => result.weapon === 'ArmingSword' && result.configKey === 'AltWeaponLength')).toBe(false);
  });

  test('finds the stab curve by its key and in words, in Stab and AltStab only', () => {
    const groups = (query: string) => new Set(searchGlobal(query, context).results.filter(result => result.configKey === 'ReleaseCurve').map(result => result.group));
    expect(searchGlobal('ReleaseCurve', context).results[0]).toMatchObject({ weapon: 'ArmingSword', configKey: 'ReleaseCurve' });
    expect(groups('ReleaseCurve')).toEqual(new Set(['Stab', 'AltStab']));
    expect(groups('stab curve')).toEqual(new Set(['Stab', 'AltStab']));
    expect(searchGlobal('Longsword Stab ReleaseCurve', context).results[0]).toMatchObject({ weapon: 'Longsword', group: 'Stab', configKey: 'ReleaseCurve' });
    expect(searchGlobal('Longsword Strike ReleaseCurve', context).results).toEqual([]);
    expect(searchGlobal('Longsword General ReleaseCurve', context).results).toEqual([]);
  });

  test("a weapon's General screen shows main length roster-wide but alternate only where native", () => {
    // The rows the editor shows for a weapon: its group's keys that the weapon supports.
    const lengths = (weapon: string) => WEAPON_CONFIG_OPTIONS.General.filter(entry => supportsWeapon(entry, weapon) && entry.configKey.includes('WeaponLength')).map(entry => entry.configKey);
    expect(lengths('ArmingSword')).toEqual(['WeaponLength']);
    expect(lengths('Spear')).toEqual(['WeaponLength', 'AltWeaponLength']);
  });

  test('empty search offers navigation and never lists thousands of config keys', () => {
    const { results } = searchGlobal('  ', context);
    expect(results.some(result => result.tab === 'rulesets')).toBe(true);
    expect(results.every(result => !result.configKey)).toBe(true);
  });

  test('offers no Users page now that server owners sign in with Discord', () => {
    expect(searchGlobal('users', context).results).toEqual([]);
  });

  test('reports no matches and caps broad results with an accurate total', () => {
    expect(searchGlobal('nonexistent-setting-xyz', context)).toEqual({ total: 0, results: [] });
    const broad = searchGlobal('weapons', context);
    expect(broad.total).toBeGreaterThan(50);
    expect(broad.results).toHaveLength(50);
    expect(new Set(broad.results.map(result => result.id)).size).toBe(50);
  });
});
