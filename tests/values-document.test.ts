import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRconCommands } from '../src/lib/database/apply';
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

test("the encoder sends what today's command builder sends for the same saved values", async () => {
  const root = await mkdtemp(join(tmpdir(), 'ezconfig-encoder-'));
  try {
    // The same values as the self-hosted files, one per category.
    const { values } = placeValues(document);
    const files: [string, Record<string, unknown>][] = [
      ...Object.entries(values.character).map(([category, entries]) => [join('Character', `${category}.json`), entries] as [string, Record<string, unknown>]),
      ...Object.entries(values.weapons).flatMap(([weapon, categories]) => Object.entries(categories).map(([category, entries]) => [join('Weapon', weapon, `${category}.json`), entries] as [string, Record<string, unknown>])),
    ];
    for (const [path, entries] of files) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), JSON.stringify(entries));
    }
    const batch = commandBatch(document);
    expect(batch[0]).toBe(WIPE_COMMAND);
    expect(batch.slice(1).toSorted()).toEqual((await buildRconCommands({ databasesRoot: root, strictStorage: true })).toSorted());
    expect(batch.length).toBe(1 + files.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
