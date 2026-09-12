import { describe, expect, test } from 'bun:test';
import { searchGlobal } from '../src/components/console/search';
import { getSupportedConfigOptions } from '../src/components/weapons/WeaponAccordion';

const context = { weapon: 'ArmingSword', isAdmin: false };

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

  test('unloaded override filtering exposes main length roster-wide but alternate only where native', () => {
    expect(getSupportedConfigOptions('ArmingSword', 'General', 'WeaponLength').map(entry => entry.configKey)).toEqual(['WeaponLength']);
    expect(getSupportedConfigOptions('ArmingSword', 'General', 'AltWeaponLength')).toEqual([]);
    expect(getSupportedConfigOptions('Spear', 'General', 'WeaponLength').map(entry => entry.configKey)).toEqual(['WeaponLength', 'AltWeaponLength']);
  });

  test('empty search offers navigation and never lists thousands of config keys', () => {
    const { results } = searchGlobal('  ', context);
    expect(results.some(result => result.tab === 'presets')).toBe(true);
    expect(results.every(result => !result.configKey)).toBe(true);
  });

  test('only administrators can discover Users', () => {
    expect(searchGlobal('users', context).results).toEqual([]);
    expect(searchGlobal('users', { ...context, isAdmin: true }).results[0]).toMatchObject({ tab: 'users' });
  });

  test('reports no matches and caps broad results with an accurate total', () => {
    expect(searchGlobal('nonexistent-setting-xyz', context)).toEqual({ total: 0, results: [] });
    const broad = searchGlobal('weapons', context);
    expect(broad.total).toBeGreaterThan(50);
    expect(broad.results).toHaveLength(50);
    expect(new Set(broad.results.map(result => result.id)).size).toBe(50);
  });
});
