'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { categoryError, DataType, type ConfigEntry } from '@/lib/config/types';
import { holdRefused, type ConfigValue, type RefusedValue } from '@/lib/store/configStore';
import { useDebouncedCallback } from '@/lib/hooks';
import { SaveIndicator } from '@/components/config/SaveIndicator';
import { isOverride, newValueError, newValueOutcome, valueFromDefault } from './model';
import { defaultLabel, defaultDetails, resolveDefault } from '@/lib/config/defaults';
import { constrainedFloatTextError } from '@/lib/config/numericConstraints';
import { curveValueError } from '@/lib/config/releaseCurve';
import { ReleaseCurveDialog } from './ReleaseCurveEditor';
import { ReleaseCurveThumbnail } from './ReleaseCurveThumbnail';
import type { PreviewAttack } from './StabPreview';
const fieldError = (message?: string) => message && <small className="field-error" role="alert">{message}</small>;
type DraftField = Pick<RefusedValue, 'database' | 'category' | 'key'>;
/**
 * While a field in the Draft holds a value it refuses, the bar and the review
 * say so (online-platform#51). The All weapons sheet's value is not in the
 * Draft, so it has no `field`.
 */
function useHoldRefused(field: DraftField | undefined, text: string, error: string | undefined, discard: () => void) {
  useEffect(() => field && error ? holdRefused({ ...field, text, error, discard }) : undefined, [field, text, error, discard]);
}
function NumberField({
  value,
  onChange,
  label,
  field,
  disabled,
  debounceMs,
  minimum,
  maximum,
  integer,
  error
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  field?: DraftField;
  disabled?: boolean;
  debounceMs: number;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  error?: string;
}) {
  const commit = (text: string) => {
    if (text.trim() && Number.isFinite(Number(text)) && (minimum === undefined || !constrainedFloatTextError(text, minimum, maximum, integer))) onChange(Number(text));
  };
  const [local, change, state, flush, reset] = useDebouncedCallback(String(value), commit, debounceMs);
  const refused = minimum === undefined ? undefined : constrainedFloatTextError(local, minimum, maximum, integer);
  const discard = useCallback(() => reset(String(value)), [reset, value]);
  // Only what was typed: a saved value the schema refuses is in the Draft, and the platform marks it.
  useHoldRefused(field, local, local === String(value) ? undefined : refused, discard);
  // What the field holds now comes first: the mark is on the value last saved.
  const message = refused ?? error;
  return <div className="number-field"><input aria-label={label} aria-invalid={!!message || undefined} type="number" min={minimum} max={maximum} step={integer ? 1 : 'any'} value={local} disabled={disabled} onChange={event => change(event.target.value)} onBlur={flush} onKeyDown={event => {
      if (event.key === 'Enter') {
        flush();
        event.currentTarget.blur();
      }
    }} />{!refused && <SaveIndicator state={state} />}{fieldError(message)}</div>;
}
export function ValueEditor({
  entry,
  database,
  category,
  value,
  onChange,
  onReset,
  label,
  disabled = false,
  debounceMs = 1000,
  error,
  previewAttack
}: {
  entry: ConfigEntry;
  database?: string;
  category?: string;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
  onReset?: () => void;
  label: string;
  disabled?: boolean;
  debounceMs?: number;
  /** The platform's mark on this value: the one message it shows, unless what is being typed has its own. */
  error?: string;
  /** The attack whose `Release` times a curve's preview, where the value has none of its own, as on the All weapons sheet. */
  previewAttack?: PreviewAttack;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [curveOpen, setCurveOpen] = useState(false);
  const baseline = resolveDefault(entry, database, category).defaultValue;
  const baselineLabel = defaultLabel(entry, database, category);
  const baselineDetails = defaultDetails(entry, database, category);
  const closeDraft = useCallback(() => {
    setEditing(false);
    setDraft('');
  }, []);
  const field = useMemo(() => database && category ? { database, category, key: entry.configKey } : undefined, [database, category, entry.configKey]);
  useHoldRefused(field, draft, editing && !isOverride(value) ? newValueError(draft, entry) : undefined, closeDraft);
  const leaveDraft = (deliberate: boolean) => {
    const outcome = newValueOutcome(draft, baseline, entry, deliberate);
    if (outcome === 'refused') return;
    if (outcome !== 'close') onChange(outcome);
    closeDraft();
  };
  const number = (n: number, change: (n: number) => void, name = label, mark?: string) => <NumberField error={mark} value={n} onChange={change} label={name} field={field} disabled={disabled} debounceMs={debounceMs} minimum={entry.dataType === DataType.Float ? entry.minimum : undefined} maximum={entry.dataType === DataType.Float ? entry.maximum : undefined} integer={entry.dataType === DataType.Float ? entry.integer : undefined} />;
  const chips = (list: number[]) => <div className="array-value">{list.map((n, index) => <div className="array-chip" key={index}>{number(n, next => onChange(list.map((old, i) => i === index ? next : old)), `${label} value ${index + 1}`)}<button className="icon-button" aria-label={`Remove ${label} value ${index + 1}`} disabled={disabled} onClick={() => onChange(list.filter((_, i) => i !== index))}><X size={11} /></button></div>)}<button className="add-value" disabled={disabled} onClick={() => onChange([...list, 0])}>+ value</button></div>;
  if (entry.isReleaseCurve) {
    // The picture stands in for the value and opens the editor, where the first edit makes the override. A value it cannot edit only needs its reason and a Reset.
    const overridden = isOverride(value);
    const takesKey = !category || !categoryError(entry, category);
    const refusal = overridden ? curveValueError(value) ?? (category ? categoryError(entry, category) : undefined) : undefined;
    const editable = takesKey && !refusal;
    const picture = <ReleaseCurveThumbnail value={value} />;
    return <div className="value-with-default curve-value"><div className="value-editor">{editable ? <button type="button" className="curve-open" disabled={disabled} aria-haspopup="dialog" aria-label={`Edit ${label}`} onClick={() => setCurveOpen(true)}>{picture}</button> : picture}{overridden && onReset && <button className="icon-button reset-value" disabled={disabled} title={`Reset — ${baselineDetails}`} aria-label={`Reset ${label} to game default`} onClick={onReset}><RotateCcw size={13} /></button>}</div>{fieldError(refusal ?? error)}{takesKey && (!overridden || onReset) && <small className="default-caption" title={field && baselineDetails}>{field ? 'Default: stock shape' : 'Open it to draw a curve or pick a starter shape'}</small>}{editable && curveOpen && <ReleaseCurveDialog place={database && category ? `${database} · ${category}` : 'All weapons sheet'} value={value} savesToDraft={!!field} attack={previewAttack ?? (database && category ? { database, category } : undefined)} onChange={onChange} onReset={onReset} onClose={() => setCurveOpen(false)} />}</div>;
  }
  if (!isOverride(value)) {
    if (editing) {
      const refused = newValueError(draft, entry);
      return <><input className="new-value" autoFocus aria-label={label} aria-invalid={!!(refused ?? error) || undefined} min={entry.minimum} max={entry.maximum} type="number" step={entry.integer ? 1 : 'any'} placeholder="type a value" value={draft} onChange={event => setDraft(event.target.value)} onFocus={event => event.currentTarget.select()} onBlur={() => leaveDraft(false)} onKeyDown={event => {
        if (event.key === 'Enter') leaveDraft(true);
        if (event.key === 'Escape') closeDraft();
      }} />{fieldError(refused ?? error)}</>;
    }
    return <><button className="game-default" disabled={disabled} title={`${baselineDetails}\nCustomize ${label}`} onClick={() => {
      if (entry.dataType === DataType.Float) {
        setDraft(typeof baseline === 'number' ? String(baseline) : '');
        setEditing(true);
      } else onChange(valueFromDefault(baseline, entry));
    }}>{baselineLabel}</button>{fieldError(error)}</>;
  }
  let control;
  switch (entry.dataType) {
    case DataType.Bool:
      control = <label className="bool-value"><Switch aria-label={label} checked={value === true} onCheckedChange={onChange} disabled={disabled} /><span>{String(value)}</span></label>;
      break;
    case DataType.Float:
      control = number(value as number, onChange, label, error);
      break;
    case DataType.String:
      control = <select aria-label={label} value={String(value)} disabled={disabled} onChange={event => onChange(event.target.value)}>{[...new Set([...(entry.choices ?? []), String(value)])].map(choice => <option key={choice}>{choice}</option>)}</select>;
      break;
    case DataType.FloatArray:
      control = chips(value as number[]);
      break;
    default:
      {
        const axes = entry.dataType === DataType.Vector ? ['x', 'y', 'z'] : ['x', 'y'];
        const vector = value as Record<string, number>;
        control = <div className="vector-value">{axes.map(axis => <label key={axis}><span>{axis.toUpperCase()}</span>{number(vector[axis], next => onChange({
              ...vector,
              [axis]: next
            } as ConfigValue), `${label} ${axis}`)}</label>)}</div>;
      }
  }
  return <div className="value-with-default"><div className="value-editor">{control}{onReset && <button className="icon-button reset-value" disabled={disabled} title={`Reset — ${baselineDetails}`} aria-label={`Reset ${label} to game default`} onClick={onReset}><RotateCcw size={13} /></button>}</div>{entry.dataType !== DataType.Float && fieldError(error)}{onReset && <small className="default-caption" title={baselineDetails}>{baselineLabel}</small>}</div>;
}
