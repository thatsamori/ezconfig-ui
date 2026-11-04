import { CategoryName, WEAPON_CONFIG_OPTIONS, WeaponConfigGroupName } from '@/lib/config/weaponConfigSchema';
import { constrainedFloatTextError } from '@/lib/config/numericConstraints';
import { resolveDefault } from '@/lib/config/defaults';
import { curveValueError } from '@/lib/config/releaseCurve';
import { DataType, supportsCategory, type ConfigEntry, type DefaultValue } from '@/lib/config/types';
import type { ConfigState, ConfigValue, ValueChange } from '@/lib/store/configStore';
export const weapons = Object.values(CategoryName).sort((a, b) => a.localeCompare(b));
export const attackGroups = Object.values(WeaponConfigGroupName);
export const isOverride = (value: ConfigValue | undefined): value is Exclude<ConfigValue, null> => value !== undefined && value !== null;
export const countEntries = (entries: Record<string, ConfigValue> = {}) => Object.values(entries).filter(isOverride).length;
export const countGroups = (groups: Record<string, Record<string, ConfigValue>> = {}) => Object.values(groups).reduce((total, entries) => total + countEntries(entries), 0);
export const countOverrides = (values: ConfigState['values']) => countGroups(values.character) + Object.values(values.weapons).reduce((total, groups) => total + countGroups(groups), 0);
export const showValue = (value: ConfigValue | undefined): string => !isOverride(value) ? 'Game default' : typeof value === 'object' ? Array.isArray(value) ? value.join(', ') : Object.entries(value).map(([axis, n]) => `${axis.toUpperCase()} ${n}`).join(' · ') : String(value);
export const sameValue = (a: ConfigValue | undefined, b: ConfigValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
/** Of a row's groups, the ones that take this key: the only ones "Set all" and the All weapons sheet write to. */
export const groupsTaking = (entry: ConfigEntry, groups: string[]) => groups.filter(group => supportsCategory(entry, group));
/**
 * Whether a table with these groups shows this key's row: a group takes it, or
 * holds a value of it from a file or an older Draft. That value is refused, so the
 * owner has to be able to see it and reset it.
 */
export const showsKey = (entry: ConfigEntry, groups: string[], categories: Record<string, Record<string, ConfigValue>> = {}) =>
  groups.some(group => supportsCategory(entry, group) || isOverride(categories[group]?.[entry.configKey]));
/** Whether a key is a release curve, for what names values by key alone, as the Apply review does. */
export const isReleaseCurveKey = (key: string) => WEAPON_CONFIG_OPTIONS.Attack.some(entry => entry.configKey === key && entry.isReleaseCurve);
/** A `Release` that can time a stab, and whether it came from the Draft rather than the default. */
export type PreviewRelease = { seconds: number; fromDraft: boolean };
const releaseEntry = WEAPON_CONFIG_OPTIONS.Attack.find(entry => entry.configKey === 'Release')!;
/**
 * What times this attack's stab in the curve dialog: the Draft's `Release`, or else
 * its default. Undefined when there is no single usable number: a default that is
 * missing or varies, or a stored value that can't time a stab. That stored value is
 * what would be sent, so the default does not stand in for it.
 */
export function previewRelease(values: ConfigState['values'], database: string, category: string): PreviewRelease | undefined {
  const stored = values.weapons[database]?.[category]?.Release;
  const fromDraft = isOverride(stored);
  const seconds = fromDraft ? stored : resolveDefault(releaseEntry, database, category).defaultValue;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? { seconds, fromDraft } : undefined;
}
export type SweepMode = 'set' | 'multiply' | 'add';
/** What the All weapons sheet offers for a key; only a Float can be multiplied or added to. */
export const sweepModes = (entry: ConfigEntry): readonly (SweepMode | 'reset')[] => entry.dataType === DataType.Float ? ['set', 'multiply', 'add', 'reset'] : ['set', 'reset'];
export function sweepValue(stored: ConfigValue | undefined, mode: SweepMode, value: ConfigValue, base?: number): ConfigValue | undefined {
  if (mode === 'set') return value;
  const start = typeof stored === 'number' ? stored : base;
  if (start === undefined || typeof value !== 'number') return undefined;
  const result = mode === 'multiply' ? start * value : start + value;
  return Number.isFinite(result) ? Number(result.toFixed(6)) : undefined;
}
/** Whether the sheet's value can go in the Draft: a curve with a bad shape stays on the sheet, with its reason, until it is fixed. */
export const sweepSettable = (entry: ConfigEntry, value: ConfigValue | undefined) => isOverride(value) && !(entry.isReleaseCurve && curveValueError(value));
/** What the sheet starts with: the first stored value it could set, so a bad shape is never offered as the value to spread. */
export const sweepStart = (entry: ConfigEntry, stored: (ConfigValue | undefined)[]) => stored.find(value => sweepSettable(entry, value));
/** One row of the All weapons sheet per weapon: what each of `groups` holds, what it would hold, and whether that is a change. */
export function sweepRows({ entry, groups, values, mode, value, base, selected }: {
  entry: ConfigEntry;
  groups: string[];
  values: ConfigState['values'];
  mode: SweepMode | 'reset';
  value: ConfigValue | undefined;
  base: number | undefined;
  selected: ReadonlySet<string>;
}) {
  const settable = sweepSettable(entry, value);
  return weapons.map(name => {
    const before = groups.map(group => values.weapons[name]?.[group]?.[entry.configKey]);
    const after = before.map(stored => mode === 'reset' ? null : settable ? sweepValue(stored, mode, value!, base) : undefined);
    const noBase = (mode === 'multiply' || mode === 'add') && before.some(stored => !isOverride(stored)) && base === undefined;
    const enabled = selected.has(name) && !noBase;
    const changed = after.map((next, index) => enabled && (next === null ? isOverride(before[index]) : isOverride(next) && !sameValue(next, before[index])));
    const changes = changed.filter(Boolean).length;
    return { name: name as string, before, after, noBase, enabled, changed, changes };
  });
}
export type SweepRow = ReturnType<typeof sweepRows>[number];
/** The sheet's writes: only changed cells, a null being Reset. */
export const sweepChanges = (rows: SweepRow[], groups: string[], key: string): ValueChange[] => rows.flatMap(row => groups.flatMap((category, index) => {
  const next = row.after[index];
  return row.changed[index] && next !== undefined ? [{ database: row.name, category, key, value: next }] : [];
}));
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
/**
 * What one click on a default stores, for the kinds with no new value to open. A
 * Bool can change only one way, so it takes the opposite of its default, or `true`
 * with no single default. The others start from the default, to edit from there.
 */
export function valueFromDefault(baseline: DefaultValue | undefined, entry: ConfigEntry): ConfigValue {
  if (entry.dataType === DataType.Bool) return baseline !== true;
  if (baseline !== undefined) return structuredClone(baseline);
  if (entry.dataType === DataType.FloatArray) return [];
  if (entry.dataType === DataType.String) return entry.choices?.[0] ?? '';
  return entry.dataType === DataType.Vector ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 };
}
/**
 * The wheel over a focused number input steps its value instead of scrolling.
 * Browsers leave a read-only input's value alone and scroll as usual, so the
 * input is read-only until this wheel event has been handled. It keeps its
 * focus, its selection and what it holds.
 */
export function holdNumberForWheel({ target }: Pick<Event, 'target'>) {
  const input = target as HTMLInputElement | null;
  if (input?.type !== 'number' || input.readOnly || !input.matches(':focus')) return;
  input.readOnly = true;
  setTimeout(() => {
    input.readOnly = false;
  });
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
