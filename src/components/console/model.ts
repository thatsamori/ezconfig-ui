import { CategoryName, WeaponConfigGroupName } from '@/lib/config/weaponConfigSchema';
import { constrainedFloatTextError } from '@/lib/config/numericConstraints';
import type { ConfigEntry, DefaultValue } from '@/lib/config/types';
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
/** Why a Float cell's new value is refused; empty text is no value, so nothing to refuse. */
export const newValueError = (text: string, entry: ConfigEntry) => text.trim() && entry.minimum !== undefined ? constrainedFloatTextError(text, entry.minimum, entry.maximum, entry.integer) : undefined;
/**
 * What leaving a Float cell's new value does: the number to save, 'close' for
 * nothing to save, or 'refused' to stay open with the message. Enter is
 * deliberate, so it saves even an unchanged default; blur saves only a change,
 * because looking at a value must not create an override.
 */
export function newValueOutcome(text: string, baseline: DefaultValue | undefined, entry: ConfigEntry, deliberate: boolean): number | 'close' | 'refused' {
  const value = Number(text);
  if (!text.trim() || (!deliberate && value === baseline)) return 'close';
  if (newValueError(text, entry)) return 'refused';
  return Number.isFinite(value) ? value : 'close';
}
export function toggleAttackGroup(current: string[], group: string): string[] {
  if (group === 'General') return ['General'];
  if (current.includes(group) && current.length === 1) return current;
  const selected = current.includes(group) ? current.filter(item => item !== group) : [...current.filter(item => item !== 'General'), group];
  return attackGroups.filter(item => selected.includes(item));
}
export function relativeTime(value: string | number): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60000) return 'just now';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h ago`;
  return `${Math.floor(elapsed / 86400000)}d ago`;
}
