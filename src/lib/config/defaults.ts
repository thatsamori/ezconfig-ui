import snapshot from './gameDefaults.json';
import type { ConfigEntry, DefaultMetadata, DefaultValue } from './types';

const characters: Record<string, DefaultMetadata> = snapshot.character;
const weapons: Record<string, Record<string, Record<string, DefaultValue>>> = snapshot.weapons;

export function characterDefaults(entry: ConfigEntry): ConfigEntry {
  return { ...entry, ...characters[entry.configKey] };
}

export function weaponDefaults(entry: ConfigEntry, general: boolean): ConfigEntry {
  const defaultValues: NonNullable<DefaultMetadata['defaultValues']> = {};
  for (const [weapon, groups] of Object.entries(weapons)) {
    for (const [group, values] of Object.entries(groups)) {
      if ((group === 'General') !== general || values[entry.configKey] === undefined) continue;
      (defaultValues[weapon] ??= {})[group] = values[entry.configKey];
    }
  }
  return { ...entry, defaultValues };
}

/** Resolve each cell independently: alternate grips and stabs have their own defaults. */
export function resolveDefault(entry: DefaultMetadata, database?: string, category?: string): DefaultMetadata {
  const weapon = database?.replace(/^Weapon\//, '');
  const value = weapon && category ? entry.defaultValues?.[weapon]?.[category] : undefined;
  if (value !== undefined) return { defaultValue: value };
  if (entry.defaultValue !== undefined || entry.defaultVariants) return entry;
  if (!entry.defaultValues) return {};
  const variants: NonNullable<DefaultMetadata['defaultVariants']> = [];
  for (const [name, groups] of Object.entries(entry.defaultValues)) {
    for (const [group, value] of Object.entries(groups)) {
      if (weapon && name !== weapon || category && group !== category) continue;
      const existing = variants.find(item => JSON.stringify(item.value) === JSON.stringify(value));
      if (existing) existing.contexts.push(`${name} ${group}`);
      else variants.push({ value, contexts: [`${name} ${group}`] });
    }
  }
  return variants.length === 1 ? { defaultValue: variants[0].value } : { defaultVariants: variants };
}

export function formatDefaultValue(value: DefaultValue): string {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object') return Object.entries(value).map(([axis, n]) => `${axis.toUpperCase()} ${n}`).join(' · ');
  return typeof value === 'string' && value === '' ? '""' : String(value);
}

export function defaultLabel(entry: DefaultMetadata, database?: string, category?: string): string {
  const resolved = resolveDefault(entry, database, category);
  if (resolved.defaultValue !== undefined) return `Default: ${formatDefaultValue(resolved.defaultValue)}`;
  const variants = resolved.defaultVariants;
  if (!variants?.length) return 'Default unavailable';
  const values = variants.map(item => formatDefaultValue(item.value));
  return `Default: ${values.slice(0, 3).join(' / ')}${values.length > 3 ? ' / …' : ''} (varies)`;
}

export function defaultDetails(entry: DefaultMetadata, database?: string, category?: string): string {
  const resolved = resolveDefault(entry, database, category);
  const details = resolved.defaultVariants?.map(item => `${formatDefaultValue(item.value)}: ${item.contexts.join(', ')}`).join('\n');
  return `${details || defaultLabel(resolved)}\nBase values before live modifiers such as perks and loadout. Feature parameters apply only when their feature is enabled.`;
}

export function lookupDefault(database: string, category: string, key: string): DefaultMetadata {
  if (database === 'Character') return characters[key] ?? {};
  const value = weapons[database.replace(/^Weapon\//, '')]?.[category]?.[key];
  return value === undefined ? {} : { defaultValue: value };
}
