import { CategoryName, WeaponConfigGroupName } from '@/lib/config/weaponConfigSchema';
import type { ConfigState, ConfigValue } from '@/lib/store/configStore';
export const weapons = Object.values(CategoryName).sort((a, b) => a.localeCompare(b));
export const attackGroups = Object.values(WeaponConfigGroupName);
export const isOverride = (value: ConfigValue | undefined): value is Exclude<ConfigValue, null> => value !== undefined && value !== null;
export const countEntries = (entries: Record<string, ConfigValue> = {}) => Object.values(entries).filter(isOverride).length;
export const countGroups = (groups: Record<string, Record<string, ConfigValue>> = {}) => Object.values(groups).reduce((total, entries) => total + countEntries(entries), 0);
export const countOverrides = (values: ConfigState['values']) => countGroups(values.character) + Object.values(values.weapons).reduce((total, groups) => total + countGroups(groups), 0);
export const showValue = (value: ConfigValue | undefined): string => !isOverride(value) ? 'Game default' : typeof value === 'object' ? Array.isArray(value) ? value.join(', ') : Object.entries(value).map(([axis, n]) => `${axis.toUpperCase()} ${n}`).join(' · ') : String(value);
export const sameValue = (a: ConfigValue | undefined, b: ConfigValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
export type SweepMode = 'set' | 'multiply' | 'add';
export function sweepValue(stored: ConfigValue | undefined, mode: SweepMode, value: ConfigValue, base?: number): ConfigValue | undefined {
  if (mode === 'set') return value;
  const start = typeof stored === 'number' ? stored : base;
  if (start === undefined || typeof value !== 'number') return undefined;
  const result = mode === 'multiply' ? start * value : start + value;
  return Number.isFinite(result) ? Number(result.toFixed(6)) : undefined;
}
export function toggleAttackGroup(current: string[], group: string): string[] {
  if (group === 'General') return ['General'];
  if (current.includes(group) && current.length === 1) return current;
  const selected = current.includes(group) ? current.filter(item => item !== group) : [...current.filter(item => item !== 'General'), group];
  return attackGroups.filter(item => selected.includes(item));
}
export interface ReviewRow {
  id: string;
  database: string;
  category: string;
  key: string;
  value: string;
}
export function reviewRows(commands: string[]): ReviewRow[] {
  return commands.flatMap(command => {
    const match = /^string ezconfig (\S+) (\S+) (\{.*\})$/.exec(command);
    if (!match) throw new Error('The apply preview contains an unsupported command.');
    const [, database, category, json] = match;
    return Object.entries(JSON.parse(json) as Record<string, string>).map(([key, value]) => ({
      id: JSON.stringify([database, category, key]),
      database,
      category,
      key,
      value
    }));
  }).sort((a, b) => a.database.localeCompare(b.database) || a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
}
export function selectedReviewCommands(rows: ReviewRow[], selected: Set<string>): string[] {
  const groups = new Map<string, Record<string, string>>();
  for (const row of rows) {
    if (!selected.has(row.id)) continue;
    const prefix = `string ezconfig ${row.database} ${row.category}`;
    groups.set(prefix, {
      ...groups.get(prefix),
      [row.key]: row.value
    });
  }
  return [...groups].map(([prefix, entries]) => `${prefix} ${JSON.stringify(entries)}`);
}
export function relativeTime(value: string | number): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60000) return 'just now';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h ago`;
  return `${Math.floor(elapsed / 86400000)}d ago`;
}
