/**
 * The encoder (online-platform#30): a values document as today's command
 * batch, the wipe then one `string ezconfig <database> <category> <values>`
 * command per non-empty category, with every value a string as the self-hosted
 * command builder encoded it. Apply delivery sends the same commands (#32).
 *
 * Categories go in schema order and keys in document order. A value the
 * schema has no place for is not sent; one it refuses throws, so nothing
 * invalid is encoded.
 */
import { CHARACTER_CONFIG_OPTIONS } from './characterConfigSchema';
import { CategoryName, WeaponConfigGroupName } from './weaponConfigSchema';
import { DataType, type ConfigEntry } from './types';
import { documentErrors, documentFields } from './valuesDocument';
import { formatValue } from './formatters';

export const WIPE_COMMAND = 'string ezconfig WipeDatabases';

/** One category's command: `values` is the JSON object text the command takes. */
export type CategoryCommand = { database: string; category: string; values: string };

const order = [
  ...Object.keys(CHARACTER_CONFIG_OPTIONS).map(category => `Character ${category}`),
  ...Object.values(CategoryName).flatMap(weapon => Object.values(WeaponConfigGroupName).map(category => `${weapon} ${category}`)),
];

function wireValue(entry: ConfigEntry, value: unknown): string {
  // A constrained float is sent as given, so a positive duration cannot round down to the zero-duration policy.
  if (entry.dataType === DataType.Float && entry.minimum !== undefined) return String(value);
  return formatValue(entry.dataType, value);
}

/** One command per non-empty category; throws when the schema refuses a value. */
export function encodeValues(document: unknown): CategoryCommand[] {
  const errors = documentErrors(document).filter(error => error.category !== undefined);
  if (errors.length) throw new Error(`The schema refuses ${errors.map(({ database, category, key, error }) => `${database}/${category}/${key}: ${error}`).join('; ')}`);
  const categories = new Map<string, CategoryCommand & { entries: Record<string, string> }>();
  for (const field of documentFields(document)) {
    if (!field.entry || !field.category) continue;
    const name = `${field.database} ${field.category}`;
    if (!categories.has(name)) categories.set(name, { database: field.database, category: field.category, values: '', entries: {} });
    categories.get(name)!.entries[field.key] = wireValue(field.entry, field.value);
  }
  return [...categories.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([, { database, category, entries }]) => ({ database, category, values: JSON.stringify(entries) }));
}

/** The batch a document delivers: the wipe, then its category commands. */
export function commandBatch(document: unknown): string[] {
  return [WIPE_COMMAND, ...encodeValues(document).map(({ database, category, values }) => `string ezconfig ${database} ${category} ${values}`)];
}
