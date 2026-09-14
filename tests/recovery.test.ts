import { expect, test } from 'bun:test';
import { RECOVERY_CONFIG_OPTIONS } from '../src/lib/config/recoveryConfigSchema';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { DataType } from '../src/lib/config/types';
import { validateEntries } from '../src/lib/database/validation';

test('recovery scalar controls use independent explicit motion defaults and the DynamicFeintWindow toggle has a false default', () => {
  expect(RECOVERY_CONFIG_OPTIONS.find(entry => entry.configKey === 'WorldRecoveryTime')).toBeDefined();
  const dynamicFeintWindow = RECOVERY_CONFIG_OPTIONS.find(entry => entry.configKey === 'DynamicFeintWindow');
  if (!dynamicFeintWindow) throw new Error('DynamicFeintWindow must be present in Recovery');
  expect(dynamicFeintWindow).toMatchObject({
    dataType: DataType.Bool,
    isFeatureToggle: true,
    default: false,
  });
  expect(CHARACTER_CONFIG_OPTIONS.Recovery).toContain(dynamicFeintWindow);
  expect(validateEntries({ DynamicFeintWindow: true }, 'Character', 'Recovery').valid).toBe(true);
  expect(validateEntries({ DynamicFeintWindow: 1 }, 'Character', 'Recovery').valid).toBe(false);

  const scalarEntries = RECOVERY_CONFIG_OPTIONS.filter(entry => entry.configKey !== 'DynamicFeintWindow');
  for (const entry of scalarEntries) {
    expect(CHARACTER_CONFIG_OPTIONS.Recovery).toContain(entry);
    expect(entry.dataType).toBe(DataType.Float);
    expect(entry.gatedBy).toBeUndefined();
    expect(entry.default).toBeUndefined();
    expect(entry.defaultVariesByMotion).toBe(true);
  }
  for (const value of [0, -0.25, 0.8]) {
    expect(validateEntries({ WorldRecoveryTime: value }, 'Character', 'Recovery').valid).toBe(true);
  }
  expect(validateEntries({ WorldRecoveryTime: false }, 'Character', 'Recovery').valid).toBe(false);
});

test('world recovery survives real save/review/selected apply and reset with zero and negative values', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/recovery-world-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('parried recovery preserves independent offsets, partial and reversed limits through real review/apply', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/recovery-parried-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('world stamina factor remains independent through saved review, selected apply and reset', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/recovery-stamina-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('strike and stab feint extras preserve independent signed values through real review/apply', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/recovery-feint-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
