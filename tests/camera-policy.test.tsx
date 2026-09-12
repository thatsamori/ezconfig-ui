import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { join } from 'node:path';
import { CAMERA_CONFIG_OPTIONS } from '../src/lib/config/cameraConfigSchema';
import { constrainedFloatTextError } from '../src/lib/config/numericConstraints';
import { cameraCommandError } from '../src/lib/config/cameraPolicyValidation';
import { getSchemaForCategory, validateConfigEntry } from '../src/lib/database/validation';
import { ValueEditor } from '../src/components/console/ValueEditor';

test('Camera exposes independent server policy with guarded whole-degree inputs', () => {
  const schema = getSchemaForCategory('Character', 'Camera')!;
  expect(Object.keys(schema)).toEqual(['CustomFOV', 'CustomFOVMax']);
  expect(schema.CustomFOV.defaultValue).toBe(false);
  expect(schema.CustomFOVMax.defaultValue).toBe(120);
  expect(schema.CustomFOVMax.gatedBy).toBe('CustomFOV');
  for (const value of [101, 120, 179, 1.2e2]) expect(validateConfigEntry('CustomFOVMax', value, schema).valid).toBe(true);
  for (const value of [100, 180, 120.5, 120.0000001, 179.0000001, 100.9999999, NaN, Infinity, -Infinity, '120', true, null]) {
    expect(validateConfigEntry('CustomFOVMax', value as never, schema).valid, String(value)).toBe(false);
  }
  const html = renderToStaticMarkup(createElement(ValueEditor, {
    entry: CAMERA_CONFIG_OPTIONS[1], value: 120, onChange: () => {}, label: 'Custom FOV maximum', disabled: true,
  }));
  expect(html).toContain('min="101"'); expect(html).toContain('max="179"'); expect(html).toContain('step="1"'); expect(html).toContain('disabled');
  const invalid = renderToStaticMarkup(createElement(ValueEditor, {
    entry: CAMERA_CONFIG_OPTIONS[1], value: 120.5, onChange: () => {}, label: 'Custom FOV maximum',
  }));
  expect(invalid).toContain('aria-invalid="true"'); expect(invalid).toContain('Use a whole number.');
});

test('raw decimal input cannot round a fractional maximum into a valid integer', () => {
  for (const value of ['true', 'FALSE']) expect(cameraCommandError([
    `string ezconfig Character Camera ${JSON.stringify({ CustomFOV: value })}`,
  ])).toBeUndefined();
  for (const text of ['120', '+120', '120.0', '1.2e2', '12000e-2', '.12e3', '00120.000e+000', '1.7900E2']) {
    expect(constrainedFloatTextError(text, 101, 179, true), text).toBeUndefined();
  }
  for (const text of ['', '120.0000001', '120.00000000000000000000001', '179.0000001', '100.9999999', '1.201e2', '120e-1', 'NaN', 'Infinity', '1e999999', '120e-999999', '0x78', '1_20']) {
    expect(constrainedFloatTextError(text, 101, 179, true), text).toBeDefined();
  }
});

test('Camera crosses real save/preset/review/apply/startup and TCP RCON boundaries', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'camera-policy-flow.ts')], {
    cwd: join(import.meta.dir, '..'), env: process.env, stdout: 'pipe', stderr: 'pipe',
  });
  expect(result.exitCode, result.stderr.toString() + result.stdout.toString()).toBe(0);
}, 30_000);
