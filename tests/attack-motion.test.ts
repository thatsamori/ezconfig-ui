import { expect, test } from 'bun:test';
import { ATTACK_MOTION_CONFIG_OPTIONS } from '../src/lib/config/attackMotionConfigSchema';
import { getSchemaForCategory, validateEntries } from '../src/lib/database/validation';
import { CHARACTER_CONFIG_OPTIONS, CharacterConfigGroupName } from '../src/lib/config/characterConfigSchema';
import { DataType } from '../src/lib/config/types';

test('AttackMotion is a Character category with 34 distinct controls and no invented numeric defaults', () => {
  const entries = CHARACTER_CONFIG_OPTIONS[CharacterConfigGroupName.AttackMotion];
  expect(entries).toBe(ATTACK_MOTION_CONFIG_OPTIONS);
  expect(new Set(entries.map(entry => entry.configKey)).size).toBe(34);
  for (const entry of entries.filter(entry => entry.dataType === DataType.Float)) {
    expect(entry.default).toBeUndefined();
    expect(entry.defaultVariesByMotion).toBe(true);
  }
  expect(getSchemaForCategory('Character', 'AttackMotion')?.StrikeMorphWindow).toBeDefined();
});

test('motion validation preserves zero, false and negative compensation while rejecting wrong types', () => {
  const valid = validateEntries({
    StrikeFeintWindow: 0,
    DisableStrikeEndReleaseGlances: false,
    StrikeCounterCompensateOverheadFixupTerm: -0.65,
  }, 'Character', 'AttackMotion');
  expect(valid.valid).toBe(true);
  expect(validateEntries({ StrikeFeintWindow: false }, 'Character', 'AttackMotion').valid).toBe(false);
  expect(validateEntries({ DisableStrikeEndReleaseGlances: 0 }, 'Character', 'AttackMotion').valid).toBe(false);
});
