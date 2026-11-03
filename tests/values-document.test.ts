import { expect, test } from 'bun:test';
import { commandBatch, encodeValues, WIPE_COMMAND } from '../src/lib/config/encodeValues';
import { documentErrors, isValuesDocument, placeValues, valuesDocument, type ValuesDocument } from '../src/lib/config/valuesDocument';

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
