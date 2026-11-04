import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ValueEditor } from '../src/components/console/ValueEditor';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { WEAPON_CONFIG_OPTIONS } from '../src/lib/config/weaponConfigSchema';
import type { ConfigValue } from '../src/lib/store/configStore';

// A refused value's message shows once (online-platform#46).

const key = (configKey: string) => Object.values(CHARACTER_CONFIG_OPTIONS).flat().find(entry => entry.configKey === configKey)!;
const editor = (configKey: string, value: ConfigValue | undefined, error?: string) => renderToStaticMarkup(createElement(ValueEditor, {
  entry: key(configKey), value, onChange: () => {}, onReset: () => {}, label: configKey, error,
}));
const alerts = (html: string) => [...html.matchAll(/role="alert">([^<]*)</g)].map(match => match[1]);

describe("a value's message", () => {
  test('a Draft opening with a refused value shows the mark once, on the marked field', () => {
    const html = editor('CustomFOVMax', 120.5, 'Use a whole number.');
    expect(alerts(html)).toEqual(['Use a whole number.']);
    expect(html).toContain('aria-invalid="true"');
  });
  test('a number the field itself refuses still says so, without a mark', () => {
    expect(alerts(editor('CustomFOVMax', 500))).toEqual(['Use a finite value from 101 to 179.']);
  });
  test('what the field holds comes before an older mark', () => {
    expect(alerts(editor('CustomFOVMax', 500, 'Use a whole number.'))).toEqual(['Use a finite value from 101 to 179.']);
  });
  test('a mark on a value the field cannot check itself still shows', () => {
    const html = editor('MaxWalkSpeed', 450, 'Refused by the platform.');
    expect(alerts(html)).toEqual(['Refused by the platform.']);
    expect(html).toContain('aria-invalid="true"');
  });
  test('every other kind of value shows a mark once', () => {
    expect(alerts(editor('CustomFOV', true, 'Refused by the platform.'))).toEqual(['Refused by the platform.']);
    expect(alerts(editor('HighBlockColliderRelativeOffsetLocation', { x: 1, y: 2, z: 3 }, 'Refused by the platform.'))).toEqual(['Refused by the platform.']);
  });
  test('a mark still shows beside a default, until the save that cleared the value answers', () => {
    expect(alerts(editor('CustomFOVMax', undefined, 'Use a whole number.'))).toEqual(['Use a whole number.']);
  });
  test('a valid value with no mark shows no message', () => {
    const html = editor('CustomFOVMax', 130);
    expect(alerts(html)).toEqual([]);
    expect(html).not.toContain('aria-invalid');
  });
});

// The picture stands in for a release curve, and opens the editor (stab-curve-keys#05): the cell holds no numbers.
describe('a release curve cell', () => {
  const entry = WEAPON_CONFIG_OPTIONS.Attack.find(entry => entry.configKey === 'ReleaseCurve')!;
  const writes: unknown[] = [];
  const cell = (value: ConfigValue | undefined, error?: string, category = 'Stab') => renderToStaticMarkup(createElement(ValueEditor, {
    entry, database: 'Longsword', category, value, onChange: next => writes.push(next), onReset: () => writes.push('reset'), label: `Longsword ${category} ReleaseCurve`, error,
  }));
  const FAST_START = [0, 0, 0.2, 0.9, 1, 1];
  const opens = (html: string) => html.includes('aria-haspopup="dialog"');

  test('with no override shows the stock shape, to open, with nothing to reset', () => {
    const html = cell(undefined);
    expect(html).toContain('curve-stock');
    expect(opens(html)).toBe(true);
    expect(html).toContain('aria-label="Edit Longsword Stab ReleaseCurve"');
    expect(html).toContain('Default: stock shape');
    expect(html).not.toContain('Reset Longsword');
    expect(alerts(html)).toEqual([]);
  });
  test('a default is never offered as the click that makes an override', () => {
    expect(cell(undefined)).not.toContain('game-default');
    expect(cell(undefined)).not.toContain('Customize');
  });
  test('with an override shows its own picture, to open, with Reset', () => {
    const html = cell(FAST_START);
    expect(html).toContain('points="0,100 20,10 100,0"');
    expect(html).not.toContain('curve-stock');
    expect(opens(html)).toBe(true);
    expect(html).toContain('aria-label="Reset Longsword Stab ReleaseCurve to game default"');
  });
  test('stays compact, with no numbers in the cell whatever it holds', () => {
    for (const value of [undefined, FAST_START, [0, 0, 0.5, 0.5], 0.5]) {
      for (const category of ['Stab', 'Strike']) {
        const html = cell(value, undefined, category);
        expect(html).not.toContain('<input');
        expect(html).not.toContain('array-chip');
      }
    }
  });
  test('a bad shape has its reason once and Reset, with nothing to open, as the store holds it before the platform answers', () => {
    const html = cell([0, 0, 0.5, 0.5]);
    expect(alerts(html)).toEqual(['End the curve at (1,1).']);
    expect(html).toContain('>Refused<');
    expect(opens(html)).toBe(false);
    expect(html).toContain('Reset Longsword Stab ReleaseCurve');
    expect(html).toContain('Default: stock shape');
  });
  test("the platform's mark shows once, and what the field holds comes first", () => {
    expect(alerts(cell([0, 0, 0.5, 0.5], 'End the curve at (1,1).'))).toEqual(['End the curve at (1,1).']);
    expect(alerts(cell([0, 0, 0.5, 0.5], 'An older mark.'))).toEqual(['End the curve at (1,1).']);
  });
  test('a good shape left in a strike has its reason and Reset, and no default to go back to', () => {
    for (const error of ['Use this key only in Stab and AltStab.', undefined]) {
      const html = cell(FAST_START, error, 'Strike');
      expect(alerts(html)).toEqual(['Use this key only in Stab and AltStab.']);
      expect(html).toContain('points="0,100 20,10 100,0"');
      expect(html).toContain('Reset Longsword Strike ReleaseCurve');
      expect(opens(html)).toBe(false);
      expect(html).not.toContain('Default: stock shape');
    }
  });
  test('a bad shape left in a strike names what is wrong with the shape, and has no default either', () => {
    const html = cell([0, 0, 0.5, 0.5], undefined, 'Strike');
    expect(alerts(html)).toEqual(['End the curve at (1,1).']);
    expect(html).not.toContain('Default: stock shape');
  });
  test('a mark on a good shape in a stab shows, and the curve still opens', () => {
    const html = cell(FAST_START, 'Refused by the platform.');
    expect(alerts(html)).toEqual(['Refused by the platform.']);
    expect(opens(html)).toBe(true);
  });
  test('a mark still shows beside a default, until the save that cleared the value answers', () => {
    expect(alerts(cell(undefined, 'Refused by the platform.'))).toEqual(['Refused by the platform.']);
  });
  test('a value of the wrong type from an older Draft still renders, with its Reset', () => {
    const html = cell(0.5, 'Expected FloatArray, got Float');
    expect(html).toContain('>Refused<');
    expect(opens(html)).toBe(false);
    expect(html).toContain('Reset Longsword Stab ReleaseCurve');
  });
  test('on the All weapons sheet opens to set a curve, with nothing to reset', () => {
    const sheet = (value: ConfigValue | undefined) => renderToStaticMarkup(createElement(ValueEditor, { entry, value, onChange: next => writes.push(next), label: 'Sweep value' }));
    expect(opens(sheet(undefined))).toBe(true);
    expect(sheet(undefined)).toContain('Open it to draw a curve or pick a starter shape');
    expect(sheet(undefined)).not.toContain('Default: stock shape');
    expect(opens(sheet(FAST_START))).toBe(true);
    expect(sheet(FAST_START)).not.toContain('Open it to draw');
    expect(sheet(FAST_START)).not.toContain('Reset');
  });
  test('rendering a cell, whatever it holds, writes nothing', () => {
    expect(writes).toEqual([]);
  });
});
