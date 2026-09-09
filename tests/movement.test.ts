import { expect, test } from 'bun:test';
import { MOVEMENT_CONFIG_OPTIONS } from '../src/lib/config/movementConfigSchema';
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { DataType } from '../src/lib/config/types';
import { validateEntries } from '../src/lib/database/validation';

test('walking speed is an independent explicit Movement value with an honest game default', () => {
  const entry = MOVEMENT_CONFIG_OPTIONS.find(entry => entry.configKey === 'MaxWalkSpeed')!;
  expect(CHARACTER_CONFIG_OPTIONS.Movement).toContain(entry);
  expect(entry.dataType).toBe(DataType.Float);
  expect(entry.gatedBy).toBeUndefined();
  expect(entry.default).toBeUndefined();
  expect(entry.defaultVariesByMotion).toBeUndefined();
  expect(entry.requiresExplicitValue).toBe(true);
  expect(entry.documentation).toEndWith('Cswics mod: customMovementSpeedMultiplier.X × 308.');
  for (const value of [0, -100, 450]) {
    expect(validateEntries({ MaxWalkSpeed: value }, 'Character', 'Movement').valid).toBe(true);
  }
  expect(validateEntries({ MaxWalkSpeed: false }, 'Character', 'Movement').valid).toBe(false);
});

test('walking speed survives real store/save/review/selected apply and reset with zero and negative values', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/movement-walk-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('crouch and directional controls remain independent through real store/review/selected apply', () => {
  for (const key of ['MaxWalkSpeedCrouched', 'MaxWalkSpeedCrouchedWithRatPerk', 'BackpedalModifier', 'StrafeModifier']) {
    const entry = CHARACTER_CONFIG_OPTIONS.Movement.find(entry => entry.configKey === key)!;
    expect(entry.dataType).toBe(DataType.Float);
    expect(entry.default).toBeUndefined();
    expect(entry.defaultVariesByMotion).toBeUndefined();
    expect(entry.requiresExplicitValue).toBe(true);
    expect(entry.gatedBy).toBeUndefined();
  }
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/movement-crouch-direction-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('sprint controls preserve explicit defaults and independent TimeToMaxSprint through review/apply', () => {
  for (const key of ['PartialSprintModifier', 'SprintModifier', 'SprintAcceleration', 'SupersprintModifier']) {
    const entry = CHARACTER_CONFIG_OPTIONS.Movement.find(entry => entry.configKey === key)!;
    expect(entry.dataType).toBe(DataType.Float);
    expect(entry.default).toBeUndefined();
    expect(entry.defaultVariesByMotion).toBeUndefined();
    expect(entry.requiresExplicitValue).toBe(true);
    expect(entry.gatedBy).toBeUndefined();
  }
  const existing = CHARACTER_CONFIG_OPTIONS.Movement.find(entry => entry.configKey === 'TimeToMaxSprint')!;
  expect(existing.dataType).toBe(DataType.Float);
  expect(existing.default).toBe(.96);
  expect(existing.requiresExplicitValue).toBeUndefined();
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/movement-sprint-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('equipment subsprint controls retain independent main/alternate saved values and defaults', () => {
  for (const key of ['SubSprintSpeedBonusEquipped', 'SecondSubSprintSpeedBonusEquipped']) {
    const entry = CHARACTER_CONFIG_OPTIONS.Movement.find(entry => entry.configKey === key)!;
    expect(entry.dataType).toBe(DataType.Float);
    expect(entry.default).toBeUndefined();
    expect(entry.defaultVariesByMotion).toBeUndefined();
    expect(entry.requiresExplicitValue).toBe(true);
    expect(entry.gatedBy).toBeUndefined();
    expect(entry.isFeatureToggle).toBeUndefined();
  }
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/movement-equipment-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});

test('attack supersprint durations remain explicit independent seconds through save/review/apply', () => {
  for (const key of ['AttackSupersprintDuration', 'SecondAttackSupersprintDuration']) {
    const entry = CHARACTER_CONFIG_OPTIONS.Movement.find(entry => entry.configKey === key)!;
    expect(entry.dataType).toBe(DataType.Float);
    expect(entry.default).toBeUndefined();
    expect(entry.defaultVariesByMotion).toBeUndefined();
    expect(entry.requiresExplicitValue).toBe(true);
    expect(entry.gatedBy).toBeUndefined();
    expect(entry.isFeatureToggle).toBeUndefined();
    for (const value of [0, -.25, .45]) {
      expect(validateEntries({ [key]: value }, 'Character', 'Movement').valid).toBe(true);
    }
    expect(validateEntries({ [key]: false }, 'Character', 'Movement').valid).toBe(false);
  }
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/movement-attack-duration-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
