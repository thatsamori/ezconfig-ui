import { expect, test } from 'bun:test';
import { FREE_STUN_CONFIG_OPTIONS } from '../src/lib/config/freeStunConfigSchema';
import { STUN_CONFIG_OPTIONS } from '../src/lib/config/stunConfigSchema';
import { validateConfigEntry } from '../src/lib/database/validation';
import { defaultLabel } from '../src/lib/config/defaults';

const schema = Object.fromEntries(FREE_STUN_CONFIG_OPTIONS.map(entry => [entry.configKey, entry]));

test('FreeStun defaults off and associates its parameter without gating ordinary duration', () => {
  expect(schema.FreeStun.defaultValue).toBe(false);
  expect(schema.FreeStun.isFeatureToggle).toBe(true);
  expect(schema.FreeStunDuration.gatedBy).toBe('FreeStun');
  expect(defaultLabel(schema.FreeStunDuration)).toBe('Default: 1.075');
  expect(STUN_CONFIG_OPTIONS.find(entry => entry.configKey === 'OutOfStaminaStunDuration')!.gatedBy).toBeUndefined();
  expect(validateConfigEntry('FreeStun', false, schema)).toEqual({ valid: true });
  expect(validateConfigEntry('FreeStun', true, schema)).toEqual({ valid: true });
  expect(validateConfigEntry('FreeStun', 'false', schema).valid).toBe(false);
});

test('FreeStun duration accepts zero and finite positive game Float values', () => {
  for (const value of [0, 1e-45, 1e-40, 0.000001, 0.25, 1.075, 1.6, 100]) {
    expect(validateConfigEntry('FreeStunDuration', value, schema)).toEqual({ valid: true });
  }
});

test('FreeStun duration rejects negative/nonfinite inputs and Float overflow or underflow', () => {
  for (const value of [-1, -0.000001, NaN, Infinity, -Infinity, 1e40, Number.MIN_VALUE, '0', false, null]) {
    expect(validateConfigEntry('FreeStunDuration', value as never, schema).valid).toBe(false);
  }
});
