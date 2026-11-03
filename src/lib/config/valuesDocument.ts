/**
 * A values document: one configuration's overrides as a Draft stores them
 * (online-platform#30), and as Apply will deliver them (#32).
 *
 *   { "Character": { "<key>": <value> },
 *     "Weapon": { "<class>": { "<General key>": <value>, "<attack>": { "<attack key>": <value> } } } }
 *
 * Character values carry no category: loading places each key under its
 * current category, so a key the schema moves keeps its value. A weapon's
 * attack keys (Windup, Damage, ...) apply to each of its attacks, so they sit
 * under the attack: Strike, AltStrike, Stab or AltStab. No General key has an
 * attack's name. A value whose key or weapon class the schema lacks is not
 * shown or sent, and is left as it is stored.
 */
import { CHARACTER_CONFIG_OPTIONS } from './characterConfigSchema';
import { CategoryName, WEAPON_CONFIG_OPTIONS, WeaponConfigAttackName } from './weaponConfigSchema';
import { supportsWeapon, type ConfigEntry } from './types';
import { validateConfigEntry } from '@/lib/database/validation';
import type { ConfigValue } from '@/lib/database/types';

export type ValuesDocument = {
  Character?: Record<string, unknown>;
  Weapon?: Record<string, Record<string, unknown>>;
};

/** The editor's values: Character category → key, and weapon class → General or an attack → key. */
export type EditorValues = {
  character: Record<string, Record<string, ConfigValue>>;
  weapons: Record<string, Record<string, Record<string, ConfigValue>>>;
};

/** One value of a document; `category` and `entry` are unset when the schema has no place for it. */
export type DocumentField = {
  /** Where the value sits: ['Character', key], ['Weapon', class, key] or ['Weapon', class, attack, key]. */
  path: string[];
  database: string;
  category?: string;
  key: string;
  value: unknown;
  entry?: ConfigEntry;
};

/** A value the schema refuses, named as the editor shows it. */
export type FieldError = { database: string; category?: string; key: string; error: string };

const ATTACKS: readonly string[] = Object.values(WeaponConfigAttackName);
const WEAPON_CLASSES: readonly string[] = Object.values(CategoryName);
const byKey = (entries: ConfigEntry[]) => new Map(entries.map(entry => [entry.configKey, entry]));
const generalEntries = byKey(WEAPON_CONFIG_OPTIONS.General);
const attackEntries = byKey(WEAPON_CONFIG_OPTIONS.Attack);
const characterEntries = new Map<string, { category: string; entry: ConfigEntry }>();
for (const [category, entries] of Object.entries(CHARACTER_CONFIG_OPTIONS)) {
  for (const entry of entries) if (!characterEntries.has(entry.configKey)) characterEntries.set(entry.configKey, { category, entry });
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `value` has a document's shape: its values are not checked. */
export function isValuesDocument(value: unknown): value is ValuesDocument {
  if (!isObject(value) || Object.keys(value).some(name => name !== 'Character' && name !== 'Weapon')) return false;
  if (value.Character !== undefined && !isObject(value.Character)) return false;
  return value.Weapon === undefined || (isObject(value.Weapon) && Object.values(value.Weapon).every(isObject));
}

/** Every value in a document, in document order; anything not shaped like one is skipped. */
export function documentFields(document: unknown): DocumentField[] {
  const fields: DocumentField[] = [];
  if (!isObject(document)) return fields;
  for (const [key, value] of Object.entries(isObject(document.Character) ? document.Character : {})) {
    const known = characterEntries.get(key);
    fields.push({ path: ['Character', key], database: 'Character', category: known?.category, key, value, entry: known?.entry });
  }
  for (const [weapon, values] of Object.entries(isObject(document.Weapon) ? document.Weapon : {})) {
    const known = (entry: ConfigEntry | undefined) => entry && WEAPON_CLASSES.includes(weapon) && supportsWeapon(entry, weapon) ? entry : undefined;
    for (const [name, value] of Object.entries(isObject(values) ? values : {})) {
      if (ATTACKS.includes(name) && isObject(value)) {
        for (const [key, attackValue] of Object.entries(value)) {
          const entry = known(attackEntries.get(key));
          fields.push({ path: ['Weapon', weapon, name, key], database: weapon, category: entry && name, key, value: attackValue, entry });
        }
      } else {
        const entry = known(generalEntries.get(name));
        fields.push({ path: ['Weapon', weapon, name], database: weapon, category: entry && 'General', key: name, value, entry });
      }
    }
  }
  return fields;
}

/** Why the current schema refuses a field, camera policy included; undefined when it accepts it. */
export function fieldError(field: DocumentField): string | undefined {
  if (!field.entry) return field.database === 'Character' || WEAPON_CLASSES.includes(field.database) ? 'Unknown config key' : 'Unknown weapon class';
  return validateConfigEntry(field.key, field.value as ConfigValue, { [field.key]: field.entry }).error;
}

/** Every value of a document the current schema refuses, in document order. */
export function documentErrors(document: unknown): FieldError[] {
  return documentFields(document).flatMap(field => {
    const error = fieldError(field);
    return error ? [{ database: field.database, category: field.category, key: field.key, error }] : [];
  });
}

/**
 * The values of a document the current schema refuses, among those it has a
 * place for: a value with no place is never shown or sent, so it is never
 * refused. These block Apply, make a Live configuration Blocked, and are
 * marked in the editor.
 */
export function refusedValues(document: unknown): FieldError[] {
  return documentErrors(document).filter(error => error.category !== undefined);
}

/** Puts a value at a field's path, making the objects on the way, unless a value is already there or on the way. */
export function addField(document: ValuesDocument, path: readonly string[], value: unknown): void {
  if (path.includes('__proto__')) return;
  let target = document as Record<string, unknown>;
  for (const name of path.slice(0, -1)) {
    if (!Object.hasOwn(target, name)) target[name] = {};
    if (!isObject(target[name])) return;
    target = target[name];
  }
  const key = path[path.length - 1];
  if (!Object.hasOwn(target, key)) target[key] = value;
}

/** The values the schema has a place for, as a document of their own, as loading a Ruleset version takes them; `dropped` counts the rest. */
export function knownValues(document: unknown): { document: ValuesDocument; dropped: number } {
  const known: ValuesDocument = {};
  let dropped = 0;
  for (const field of documentFields(document)) {
    if (field.category) addField(known, field.path, field.value);
    else dropped++;
  }
  return { document: known, dropped };
}

/** Places each value under its key's current category, for the editor; `dropped` counts the values the schema has no place for. */
export function placeValues(document: unknown): { values: EditorValues; dropped: number } {
  const values: EditorValues = { character: {}, weapons: {} };
  let dropped = 0;
  for (const field of documentFields(document)) {
    if (!field.category) {
      dropped++;
      continue;
    }
    const categories = field.database === 'Character' ? values.character : (values.weapons[field.database] ??= {});
    (categories[field.category] ??= {})[field.key] = field.value as ConfigValue;
  }
  return { values, dropped };
}

/** The document the editor's values save as. A null or missing value is at its game default, so it is not in the document. */
export function valuesDocument(values: { character: Record<string, Record<string, unknown>>; weapons: Record<string, Record<string, Record<string, unknown>>> }): ValuesDocument {
  const document: ValuesDocument = {};
  for (const entries of Object.values(values.character)) {
    for (const [key, value] of Object.entries(entries)) if (value !== null && value !== undefined) addField(document, ['Character', key], value);
  }
  for (const [weapon, categories] of Object.entries(values.weapons)) {
    for (const [category, entries] of Object.entries(categories)) {
      for (const [key, value] of Object.entries(entries)) {
        if (value === null || value === undefined) continue;
        addField(document, category === 'General' ? ['Weapon', weapon, key] : ['Weapon', weapon, category, key], value);
      }
    }
  }
  return document;
}
