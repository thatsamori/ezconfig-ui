'use client';

import { useState } from 'react';
import { defaultLabel } from '@/lib/config/defaults';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import type { ConfigEntry } from '@/lib/config/types';
import { useConfigStore, flushConfigWrites, type ConfigValue } from '@/lib/store/configStore';
import { ValueEditor } from './ValueEditor';
import { ReleaseCurveThumbnail } from './ReleaseCurveThumbnail';
import { groupsTaking, isOverride, showValue, sweepChanges, sweepModes, sweepRows, sweepSettable, sweepStart, weapons, type SweepMode, type SweepRow } from './model';
/** The values of a row's groups as a cell shows them: pictures for a curve, one line of text for anything else. */
function shownCell(entry: ConfigEntry, items: (ConfigValue | undefined)[], text: string) {
  return entry.isReleaseCurve ? <span className="curve-thumbnails">{items.map((item, index) => <ReleaseCurveThumbnail key={index} value={item} />)}</span> : text;
}
/** The sheet's rows. `showsAfter`: the sheet has something to do, so each row can show what it will hold. */
export function SweepList({
  entry,
  groups,
  rows,
  mode,
  showsAfter,
  disabled,
  onSelect
}: {
  entry: ConfigEntry;
  groups: string[];
  rows: SweepRow[];
  mode: SweepMode | 'reset';
  showsAfter: boolean;
  disabled: boolean;
  onSelect: (weapon: string, checked: boolean) => void;
}) {
  const summary = (items: (ConfigValue | undefined)[], weapon?: string) => {
    const labels = items.map((value, index) => isOverride(value) ? showValue(value) : weapon ? defaultLabel(entry, weapon, groups[index]) : '—');
    return labels.every(value => value === labels[0]) ? labels[0] : labels.map((value, index) => `${groups[index]}: ${value}`).join(' · ');
  };
  return <div className="sweep-list"><div className="sweep-row sweep-heading"><span /><span>Weapon</span><span>Stored value</span><span /><span>After</span><span>Status</span></div>{rows.map(row => <div key={row.name} className={`sweep-row${row.enabled ? '' : ' unselected'}`}><Checkbox aria-label={`Select ${row.name}`} checked={row.enabled} disabled={row.noBase || disabled} onCheckedChange={checked => onSelect(row.name, !!checked)} /><span className="sweep-weapon">{row.name}</span><span className={row.before.some(isOverride) ? 'mono' : 'faint'} title={summary(row.before, row.name)}>{shownCell(entry, row.before, summary(row.before, row.name))}</span><span className="faint">→</span><span className={`mono${row.changes ? ' green' : ''}`} title={summary(row.after, mode === 'reset' ? row.name : undefined)}>{row.enabled && showsAfter ? shownCell(entry, row.after, mode === 'reset' ? 'Game default' : summary(row.after)) : '—'}</span><span className={row.noBase ? 'amber' : row.changes ? 'green' : 'faint'}>{row.noBase ? 'no base value' : !row.enabled ? 'skipped' : row.changes ? 'will change' : 'no change'}</span></div>)}</div>;
}
export function SweepPanel({
  entry,
  weapon,
  groups: shownGroups,
  onClose
}: {
  entry: ConfigEntry;
  weapon: string;
  groups: string[];
  onClose: () => void;
}) {
  const values = useConfigStore(state => state.values);
  // A key limited to some attacks is written only to those, whichever columns are showing.
  const groups = groupsTaking(entry, shownGroups);
  const source = sweepStart(entry, groups.map(group => values.weapons[weapon]?.[group]?.[entry.configKey]));
  const [mode, setMode] = useState<SweepMode | 'reset'>('set');
  const [value, setValue] = useState<ConfigValue | undefined>(source);
  const [assume, setAssume] = useState('');
  const [selected, setSelected] = useState(new Set<string>(weapons));
  const [staging, setStaging] = useState(false);
  const base = assume.trim() && Number.isFinite(Number(assume)) ? Number(assume) : undefined;
  const rows = sweepRows({ entry, groups, values, mode, value, base, selected });
  const untouched = rows.filter(row => row.before.some(value => !isOverride(value))).length;
  const total = rows.reduce((sum, row) => sum + row.changes, 0);
  const switchMode = (next: SweepMode | 'reset') => {
    setMode(next);
    setValue(next === 'multiply' ? 0.9 : next === 'add' ? 0.05 : source);
  };
  const stage = async () => {
    if (!total || staging) return;
    setStaging(true);
    try {
      // One save for the whole sweep.
      useConfigStore.getState().setValues(sweepChanges(rows, groups, entry.configKey));
      await flushConfigWrites();
      toast.success(`Saved ${total} changes to ${entry.configKey}`);
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setStaging(false);
    }
  };
  return <Dialog open onOpenChange={open => {
    if (!open && !staging) onClose();
  }}><DialogContent className="console-sheet sweep-sheet" onEscapeKeyDown={event => {
      // Escape in a new value's input discards that value, not the sheet.
      if (event.target instanceof Element && event.target.closest('.new-value')) event.preventDefault();
    }} onInteractOutside={event => {
      if (staging) event.preventDefault();
    }}>
    <DialogHeader className="sheet-header"><DialogDescription>Bulk edit · {groups.join(' · ')}</DialogDescription><DialogTitle>{entry.configKey}</DialogTitle></DialogHeader>
    <div className="sweep-controls"><div className="sweep-control-row"><div className="mode-control">{sweepModes(entry).map(item => <button key={item} disabled={staging} aria-pressed={mode === item} className={mode === item ? 'selected' : ''} onClick={() => switchMode(item)}>{item === 'set' ? 'Set to' : item === 'multiply' ? 'Multiply by' : item === 'add' ? 'Add' : 'Reset to default'}</button>)}</div>{mode !== 'reset' && <div className="sweep-value"><span>{mode === 'set' ? '=' : mode === 'multiply' ? '×' : '+'}</span><ValueEditor key={mode} entry={entry} value={value} onChange={setValue} label="Sweep value" disabled={staging} debounceMs={0} previewAttack={groups[0] ? { database: weapon, category: groups[0] } : undefined} /></div>}</div><div className="sweep-control-row"><p>{rows.filter(row => row.changes > 0).length} of {rows.filter(row => row.enabled).length} selected weapons change · {groups.length} attack type{groups.length > 1 ? 's' : ''} each</p><div className="selection-buttons"><button disabled={staging} onClick={() => setSelected(new Set(weapons))}>All</button><button disabled={staging} onClick={() => setSelected(new Set(rows.filter(row => row.before.some(isOverride)).map(row => row.name)))}>Overridden only</button><button disabled={staging} onClick={() => setSelected(new Set())}>None</button></div></div>
    {(mode === 'multiply' || mode === 'add') && untouched > 0 && <div className="untouched-notice"><p>{base === undefined ? `${untouched} untouched weapons have no stored value to ${mode === 'multiply' ? 'multiply' : 'add to'}. They're skipped unless you give a base.` : `${untouched} untouched weapons will be treated as ${base} before the operation. Verify against the game before relying on it.`}</p><label>Treat untouched as<input type="number" step="any" value={assume} disabled={staging} onChange={event => setAssume(event.target.value)} placeholder="Base value" /></label></div>}</div>
    <SweepList entry={entry} groups={groups} rows={rows} mode={mode} showsAfter={mode === 'reset' || sweepSettable(entry, value)} disabled={staging} onSelect={(name, checked) => setSelected(previous => {
      const next = new Set(previous);
      if (checked) next.add(name);else next.delete(name);
      return next;
    })} />
    <footer className="sheet-footer"><p>Saves to the Draft. Nothing reaches the game server until you Apply.</p><div><button className="outline-button" disabled={staging} onClick={onClose}>Cancel</button><button className="primary-button" disabled={!total || staging} onClick={stage}>{staging ? 'Saving…' : `Save ${total} changes`}</button></div></footer>
  </DialogContent></Dialog>;
}
