import { describe, expect, test } from 'bun:test';
import { STUN_CONFIG_OPTIONS } from '../src/lib/config/stunConfigSchema';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { validateConfigEntry } from '../src/lib/database/validation';
import { defaultLabel } from '../src/lib/config/defaults';

const schema = Object.fromEntries(STUN_CONFIG_OPTIONS.map(entry => [entry.configKey, entry]));
const key = 'OutOfStaminaStunDuration';

describe('ordinary stamina-stun numeric contract', () => {
  test('zero and finite positive durations are accepted with the measured default', () => {
    expect(defaultLabel(schema[key])).toBe('Default: 1.075');
    for (const value of [0, 0.000001, 0.25, 1.075, 1.6, 100]) {
      expect(validateConfigEntry(key, value, schema)).toEqual({ valid: true });
    }
    expect(schema[key].gatedBy).toBeUndefined();
    expect(schema[key].isFeatureToggle).toBeUndefined();
  });

  test('negative, nonfinite and incorrectly typed inputs are rejected', () => {
    for (const value of [-0.000001, -1, NaN, Infinity, -Infinity, 1e40, Number.MIN_VALUE, '0', false, null]) {
      expect(validateConfigEntry(key, value as never, schema).valid).toBe(false);
    }
  });

  test('existing Chftp numeric policy remains unchanged', () => {
    const entry = CHARACTER_CONFIG_OPTIONS.Chftp.find(entry => entry.configKey === 'ChftpStunDuration')!;
    expect(entry.minimum).toBeUndefined();
    expect(validateConfigEntry(entry.configKey, -1, { [entry.configKey]: entry }).valid).toBe(true);
  });
});
