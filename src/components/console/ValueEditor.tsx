'use client';

import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DataType, type ConfigEntry } from '@/lib/config/types';
import type { ConfigValue } from '@/lib/store/configStore';
import { useDebouncedCallback } from '@/lib/hooks';
import { SaveIndicator } from '@/components/config/SaveIndicator';
import { isOverride, newValueError, newValueOutcome } from './model';
import { defaultLabel, defaultDetails, resolveDefault } from '@/lib/config/defaults';
import { constrainedFloatTextError } from '@/lib/config/numericConstraints';
const fieldError = (message?: string) => message && <small className="field-error" role="alert">{message}</small>;
function NumberField({
  value,
  onChange,
  label,
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
  const [local, change, state, flush] = useDebouncedCallback(String(value), commit, debounceMs);
  const refused = minimum === undefined ? undefined : constrainedFloatTextError(local, minimum, maximum, integer);
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
  error
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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const baseline = resolveDefault(entry, database, category).defaultValue;
  const baselineLabel = defaultLabel(entry, database, category);
  const baselineDetails = defaultDetails(entry, database, category);
  const closeDraft = () => {
    setEditing(false);
    setDraft('');
  };
  const leaveDraft = (deliberate: boolean) => {
    const outcome = newValueOutcome(draft, baseline, entry, deliberate);
    if (outcome === 'refused') return;
    if (outcome !== 'close') onChange(outcome);
    closeDraft();
  };
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
      } else if (baseline !== undefined) onChange(structuredClone(baseline) as ConfigValue);
      else if (entry.dataType === DataType.Bool) onChange(true);
      else if (entry.dataType === DataType.FloatArray) onChange([]);
      else if (entry.dataType === DataType.String) onChange(entry.choices?.[0] ?? '');
      else onChange(entry.dataType === DataType.Vector ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 });
    }}>{baselineLabel}</button>{fieldError(error)}</>;
  }
  const number = (n: number, change: (n: number) => void, name = label, mark?: string) => <NumberField error={mark} value={n} onChange={change} label={name} disabled={disabled} debounceMs={debounceMs} minimum={entry.dataType === DataType.Float ? entry.minimum : undefined} maximum={entry.dataType === DataType.Float ? entry.maximum : undefined} integer={entry.dataType === DataType.Float ? entry.integer : undefined} />;
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
      control = <div className="array-value">{(value as number[]).map((n, index) => <div className="array-chip" key={index}>{number(n, next => onChange((value as number[]).map((old, i) => i === index ? next : old)), `${label} value ${index + 1}`)}<button className="icon-button" aria-label={`Remove ${label} value ${index + 1}`} disabled={disabled} onClick={() => onChange((value as number[]).filter((_, i) => i !== index))}><X size={11} /></button></div>)}<button className="add-value" disabled={disabled} onClick={() => onChange([...(value as number[]), 0])}>+ value</button></div>;
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
