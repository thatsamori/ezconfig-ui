import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ValueEditor } from '../src/components/console/ValueEditor';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
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
