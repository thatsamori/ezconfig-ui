import { expect, test } from 'bun:test';
import { BASE_PARRY_CONFIG_OPTIONS } from '../src/lib/config/baseParryConfigSchema';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { DataType } from '../src/lib/config/types';
import { validateEntries } from '../src/lib/database/validation';

test('all ten base controls coexist with existing features through review and selected apply', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/parry-combined-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('base parry controls remain independent and use explicit motion-dependent defaults', () => {
  expect(BASE_PARRY_CONFIG_OPTIONS.find(entry => entry.configKey === 'ParryUpTime')).toBeDefined();
  for (const entry of BASE_PARRY_CONFIG_OPTIONS) {
    expect(CHARACTER_CONFIG_OPTIONS.Parry).toContain(entry);
    expect(entry.dataType).toBe(DataType.Float);
    expect(entry.gatedBy).toBeUndefined();
    expect(entry.default).toBeUndefined();
    expect(entry.defaultVariesByMotion).toBe(true);
  }
  expect(validateEntries({ ParryUpTime: 0, ExperimentalParry: false, TrueCombo: false }, 'Character', 'Parry').valid).toBe(true);
  expect(validateEntries({ ParryUpTime: false }, 'Character', 'Parry').valid).toBe(false);
});

test('base parry save, review selection and RCON apply preserve independent values', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/base-parry-review.ts'], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('parry angle review selection and Reset preserve independent values and zero', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/parry-angles-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('parry timing controls each preserve a selected zero without dispatching siblings', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/parry-timing-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('detector window is independent of the TrueCombo toggle through review/apply', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/parry-detector-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
