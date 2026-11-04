import { describe, expect, test } from 'bun:test';
import { commandBatch, encodeValues, WIPE_COMMAND } from '../src/lib/config/encodeValues';
import { acceptedValues, documentErrors, isValuesDocument, knownValues, placeValues, refusedValues, valuesDocument, type ValuesDocument } from '../src/lib/config/valuesDocument';
import { getSchemaForCategory, validateEntries } from '../src/lib/database/validation';

// One value of every data type, constrained floats included, in Character, a weapon's General and two of its attacks.
const document: ValuesDocument = {
  Character: {
    MaxWalkSpeed: 450, CanDodge: true, TimeToMaxSprint: 0.325, ForwardParryLength: 50, CustomFOVMax: 120, CustomFOV: false,
    ChftpStunAnimation: 'Default', LowBlockColliderRelativeOffsetLocation: { x: 1, y: -2.5, z: 0 },
  },
  Weapon: {
    Greatsword: { ParryTurnCap: { x: 375, y: 262.5 }, Strike: { Windup: 0.675, Damage: [50, 45, 40] }, AltStab: { Windup: 0.4 } },
    ArmingSword: { Stab: { Windup: 0.5 } },
  },
};

// What the self-hosted command builder sent for these values, one file per category, captured before
// online-platform#41 removed it; the mod reads this encoding.
test('the encoder sends what the self-hosted command builder sent for the same values', () => {
  expect(commandBatch(document)).toEqual([
    WIPE_COMMAND,
    'string ezconfig Character Camera {"CustomFOVMax":"120","CustomFOV":"False"}',
    'string ezconfig Character Movement {"MaxWalkSpeed":"450.00","CanDodge":"True","TimeToMaxSprint":"0.325"}',
    'string ezconfig Character Chftp {"ChftpStunAnimation":"Default"}',
    'string ezconfig Character Parry {"ForwardParryLength":"50","LowBlockColliderRelativeOffsetLocation":"X=1.00,Y=-2.50,Z=0.00"}',
    'string ezconfig ArmingSword Stab {"Windup":"0.50"}',
    'string ezconfig Greatsword General {"ParryTurnCap":"X=375.00,Y=262.50,Z=0.00"}',
    'string ezconfig Greatsword Strike {"Windup":"0.675","Damage":"50.00,45.00,40.00"}',
    'string ezconfig Greatsword AltStab {"Windup":"0.40"}',
  ]);
});

test('the encoder orders categories as the schema does and keys as the document does, and sends no unknown value', () => {
  expect(encodeValues({ Character: { TimeToMaxSprint: 0.96, ParryUpTime: 0.31, MaxWalkSpeed: 450, RetiredKey: 1 }, Weapon: { Claymore: { Strike: { Windup: 1 } } } })).toEqual([
    { database: 'Character', category: 'Movement', values: '{"TimeToMaxSprint":"0.96","MaxWalkSpeed":"450.00"}' },
    { database: 'Character', category: 'Parry', values: '{"ParryUpTime":"0.31"}' },
  ]);
  expect(commandBatch({})).toEqual([WIPE_COMMAND]);
  expect(commandBatch(null)).toEqual([WIPE_COMMAND]);
});

test('the encoder refuses a value the schema refuses, naming it', () => {
  expect(() => encodeValues({ Character: { CustomFOVMax: 120.5, MaxWalkSpeed: 450 } })).toThrow('Character/Camera/CustomFOVMax: Use a whole number.');
  expect(() => encodeValues({ Weapon: { Greatsword: { Strike: { Windup: 'slow' } } } })).toThrow('Greatsword/Strike/Windup: Expected Float, got String');
});

test('a document places under current categories, counts what it cannot place, and saves back from the editor values', () => {
  const { values, dropped } = placeValues({ ...document, Character: { ...document.Character, RetiredKey: 1 }, Weapon: { ...document.Weapon, Claymore: { Windup: 1 } } });
  expect(dropped).toBe(2);
  expect(values.character.Parry).toEqual({ ForwardParryLength: 50, LowBlockColliderRelativeOffsetLocation: { x: 1, y: -2.5, z: 0 } });
  expect(values.weapons.Greatsword).toEqual({ General: { ParryTurnCap: { x: 375, y: 262.5 } }, Strike: { Windup: 0.675, Damage: [50, 45, 40] }, AltStab: { Windup: 0.4 } });
  expect(valuesDocument(placeValues(document).values)).toEqual(document);
  // A reset in the editor is a missing key, or a null on its way out.
  expect(valuesDocument({ character: { Movement: { MaxWalkSpeed: null, CanDodge: true } }, weapons: { Axe: { Strike: { Windup: null } } } })).toEqual({ Character: { CanDodge: true } });
  expect(documentErrors(document)).toEqual([]);
});

test('a values document has only Character and Weapon, each an object, with an object per weapon class', () => {
  for (const value of [{}, { Character: {} }, { Weapon: { Axe: {} } }, document]) expect(isValuesDocument(value)).toBe(true);
  for (const value of [null, [], 'x', { Settings: {} }, { Character: [] }, { Weapon: { Axe: 1 } }, { Weapon: [] }]) expect(isValuesDocument(value)).toBe(false);
});

describe('a release curve (stab-curve-keys#04)', () => {
  const FAST_START = [0, 0, 0.2, 0.9, 1, 1];
  const inStab = (value: unknown, category = 'Stab'): ValuesDocument => ({ Weapon: { Longsword: { [category]: { ReleaseCurve: value } } } });

  test('the encoder turns a curve into the command text the mod takes', () => {
    expect(commandBatch(inStab(FAST_START))).toEqual([WIPE_COMMAND, 'string ezconfig Longsword Stab {"ReleaseCurve":"0.00,0.00,0.20,0.90,1.00,1.00"}']);
    expect(commandBatch(inStab(FAST_START, 'AltStab'))).toEqual([WIPE_COMMAND, 'string ezconfig Longsword AltStab {"ReleaseCurve":"0.00,0.00,0.20,0.90,1.00,1.00"}']);
  });
  test('it sits in a Draft as its stored flat array, and saves back the same', () => {
    const stored = { Weapon: { Longsword: { Stab: { ReleaseCurve: FAST_START, Release: 0.31 }, AltStab: { ReleaseCurve: [0, 0, 1, 1] } } } };
    const { values, dropped } = placeValues(stored);
    expect(dropped).toBe(0);
    expect(values.weapons.Longsword.Stab.ReleaseCurve).toEqual(FAST_START);
    expect(valuesDocument(values)).toEqual(stored);
    expect(documentErrors(stored)).toEqual([]);
    expect(acceptedValues(stored)).toEqual({ document: stored, values: 3, dropped: [] });
  });

  const refused: [string, unknown, string][] = [
    ['no points', [], 'Use 2 to 8 points; this curve has 0.'],
    ['too many points', [0, 0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 1, 1], 'Use 2 to 8 points; this curve has 9.'],
    ['values that do not pair up', [0, 0, 1], 'Use time and progress pairs; this curve has 3 values.'],
    ['a bad start', [0.5, 0, 1, 1], 'Start the curve at (0,0).'],
    ['a bad end', [0, 0, 0.5, 0.5], 'End the curve at (1,1).'],
    ['times that do not increase', [0, 0, 0.5, 0.5, 0.5, 0.6, 1, 1], 'Keep times increasing; point 3 is not after point 2.'],
    ['a curve moving backward', [0, 0, 0.4, 0.6, 0.5, 0.5, 1, 1], 'Keep progress from going backward; point 3 is below point 2.'],
    ['an off-grid value', [0, 0, 0.205, 0.9, 1, 1], 'Use values on the 0.01 grid; 0.205 is not.'],
    ['the wrong type', 0.5, 'Expected FloatArray, got Float'],
  ];
  for (const [name, value, reason] of refused) {
    test(`${name} is refused with the reason, wherever it is judged, and the encoder throws`, () => {
      const stored = inStab(value);
      const error = { database: 'Longsword', category: 'Stab', key: 'ReleaseCurve', error: reason };
      expect(documentErrors(stored)).toEqual([error]);
      expect(refusedValues(stored)).toEqual([error]);
      expect(acceptedValues(stored)).toEqual({ document: {}, values: 0, dropped: [error] });
      expect(() => encodeValues(stored)).toThrow(`Longsword/Stab/ReleaseCurve: ${reason}`);
      expect(validateEntries({ ReleaseCurve: value as never }, 'Longsword', 'Stab')).toEqual({ valid: false, errors: [{ key: 'ReleaseCurve', reason }] });
    });
  }

  for (const category of ['Strike', 'AltStrike']) {
    test(`the key in ${category} is refused with the reason and the encoder throws, even with a good shape`, () => {
      const stored = inStab(FAST_START, category);
      const error = { database: 'Longsword', category, key: 'ReleaseCurve', error: 'Use this key only in Stab and AltStab.' };
      expect(documentErrors(stored)).toEqual([error]);
      expect(refusedValues(stored)).toEqual([error]);
      expect(acceptedValues(stored)).toEqual({ document: {}, values: 0, dropped: [error] });
      expect(() => encodeValues(stored)).toThrow(`Longsword/${category}/ReleaseCurve: Use this key only in Stab and AltStab.`);
      expect(getSchemaForCategory('Longsword', category)?.ReleaseCurve).toBeUndefined();
      expect(validateEntries({ ReleaseCurve: FAST_START }, 'Longsword', category).valid).toBe(false);
    });
    test(`the key in ${category} still has a place, so an older Draft shows it to reset and keeps it until then`, () => {
      const stored = inStab(FAST_START, category);
      const { values, dropped } = placeValues(stored);
      expect(dropped).toBe(0);
      expect(values.weapons.Longsword[category].ReleaseCurve).toEqual(FAST_START);
      expect(valuesDocument(values)).toEqual(stored);
      expect(knownValues(stored)).toEqual({ document: stored, dropped: 0 });
    });
  }

  test('a refused curve refuses the whole batch, beside values that are fine', () => {
    expect(() => commandBatch({ Character: { MaxWalkSpeed: 450 }, ...inStab([0, 0, 0.5, 0.5]) })).toThrow('Longsword/Stab/ReleaseCurve: End the curve at (1,1).');
  });
  test('an unknown weapon class is not a refusal: it has no place, as for any other key', () => {
    const stored = { Weapon: { Claymore: { Stab: { ReleaseCurve: [0, 0, 0.5, 0.5] } } } };
    expect(refusedValues(stored)).toEqual([]);
    expect(encodeValues(stored)).toEqual([]);
  });
});
