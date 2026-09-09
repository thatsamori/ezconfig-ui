'use client';

import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DataType, type ConfigEntry } from '@/lib/config/types';
import type { ConfigValue } from '@/lib/store/configStore';
import { useDebouncedCallback } from '@/lib/hooks';
import { SaveIndicator } from '@/components/config/SaveIndicator';
import { ExplicitFloatOverride } from '@/components/config/ExplicitFloatOverride';
import { isOverride } from './model';
import { defaultLabel, defaultDetails, resolveDefault } from '@/lib/config/defaults';
function NumberField({
  value,
  onChange,
  label,
  disabled,
  debounceMs
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  debounceMs: number;
}) {
  const commit = (text: string) => {
    if (text.trim() && Number.isFinite(Number(text))) onChange(Number(text));
  };
  const [local, change, state, flush] = useDebouncedCallback(String(value), commit, debounceMs);
  return <div className="number-field"><input aria-label={label} type="number" step="any" value={local} disabled={disabled} onChange={event => change(event.target.value)} onBlur={flush} onKeyDown={event => {
      if (event.key === 'Enter') {
        flush();
        event.currentTarget.blur();
      }
    }} /><SaveIndicator state={state} /></div>;
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
  debounceMs = 1000
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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const baseline = resolveDefault(entry, database, category).defaultValue;
  const baselineLabel = defaultLabel(entry, database, category);
  const baselineDetails = defaultDetails(entry, database, category);
  const commitDraft = () => {
    if (draft.trim() && Number.isFinite(Number(draft))) onChange(Number(draft));
    setEditing(false);
    setDraft('');
  };
  if (!isOverride(value)) {
    if (editing && (entry.requiresExplicitValue || entry.defaultVariesByMotion)) return <ExplicitFloatOverride
      configKey={label}
      disabled={disabled}
      onConfirm={next => { onChange(next); setEditing(false); }}
      onCancel={() => setEditing(false)}
    />;
    if (editing) return <input className="new-value" autoFocus aria-label={label} type="number" step="any" placeholder="type a value" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        setEditing(false);
        setDraft('');
      }
    }} />;
    return <button className="game-default" disabled={disabled} title={`${baselineDetails}\nCustomize ${label}`} onClick={() => {
      if (entry.dataType === DataType.Float) {
        setDraft(typeof baseline === 'number' ? String(baseline) : '');
        setEditing(true);
      } else if (baseline !== undefined) onChange(structuredClone(baseline) as ConfigValue);
      else if (entry.dataType === DataType.Bool) onChange(true);
      else if (entry.dataType === DataType.FloatArray) onChange([]);
      else if (entry.dataType === DataType.String) onChange(entry.choices?.[0] ?? '');
      else onChange(entry.dataType === DataType.Vector ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0 });
    }}>{baselineLabel}</button>;
  }
  const number = (n: number, change: (n: number) => void, name = label) => <NumberField value={n} onChange={change} label={name} disabled={disabled} debounceMs={debounceMs} />;
  let control;
  switch (entry.dataType) {
    case DataType.Bool:
      control = <label className="bool-value"><Switch aria-label={label} checked={value === true} onCheckedChange={onChange} disabled={disabled} /><span>{String(value)}</span></label>;
      break;
    case DataType.Float:
      control = number(value as number, onChange);
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
  return <div className="value-with-default"><div className="value-editor">{control}{onReset && <button className="icon-button reset-value" disabled={disabled} title={`Reset — ${baselineDetails}`} aria-label={`Reset ${label} to game default`} onClick={onReset}><RotateCcw size={13} /></button>}</div>{onReset && <small className="default-caption" title={baselineDetails}>{baselineLabel}</small>}</div>;
}
