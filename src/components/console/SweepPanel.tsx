'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DataType, type ConfigEntry } from '@/lib/config/types';
import { useConfigStore, flushConfigWrites, type ConfigValue } from '@/lib/store/configStore';
import { ValueEditor } from './ValueEditor';
import { weapons, isOverride, sameValue, showValue, sweepValue, type SweepMode } from './model';
export function SweepPanel({
  entry,
  weapon,
  groups,
  onClose
}: {
  entry: ConfigEntry;
  weapon: string;
  groups: string[];
  onClose: () => void;
}) {
  const values = useConfigStore(state => state.values);
  const source = groups.map(group => values.weapons[weapon]?.[group]?.[entry.configKey]).find(isOverride);
  const [mode, setMode] = useState<SweepMode>('set');
  const [value, setValue] = useState<ConfigValue | undefined>(source);
  const [assume, setAssume] = useState('');
  const [selected, setSelected] = useState(new Set<string>(weapons));
  const [staging, setStaging] = useState(false);
  const base = assume.trim() && Number.isFinite(Number(assume)) ? Number(assume) : undefined;
  const rows = weapons.map(name => {
    const before = groups.map(group => values.weapons[name]?.[group]?.[entry.configKey]);
    const after = before.map(stored => isOverride(value) ? sweepValue(stored, mode, value, base) : undefined);
    const noBase = mode !== 'set' && before.some(stored => !isOverride(stored)) && base === undefined;
    const enabled = selected.has(name) && !noBase;
    const changes = enabled ? after.filter((next, index) => isOverride(next) && !sameValue(next, before[index])).length : 0;
    return {
      name,
      before,
      after,
      noBase,
      enabled,
      changes
    };
  });
  const untouched = rows.filter(row => row.before.some(value => !isOverride(value))).length;
  const total = rows.reduce((sum, row) => sum + row.changes, 0);
  const summary = (items: (ConfigValue | undefined)[], mixed: string) => items.every(value => sameValue(value, items[0])) ? showValue(items[0]) : mixed;
  const switchMode = (next: SweepMode) => {
    setMode(next);
    setValue(next === 'multiply' ? 0.9 : next === 'add' ? 0.05 : source);
  };
  const stage = async () => {
    if (!total || staging) return;
    setStaging(true);
    try {
      await flushConfigWrites();
      // Persist one batch per attack type. Only changed cells are included.
      for (const [index, category] of groups.entries()) {
        const weaponValues: Record<string, Record<string, ConfigValue>> = {};
        for (const row of rows) {
          const next = row.after[index];
          if (row.enabled && isOverride(next) && !sameValue(row.before[index], next)) weaponValues[row.name] = {
            [entry.configKey]: next
          };
        }
        if (!Object.keys(weaponValues).length) continue;
        const response = await fetch('/api/config/bulk-weapons', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            category,
            weaponValues
          })
        });
        const result = await response.json();
        // A partial disk failure reports the exact weapons that succeeded.
        const updated: string[] = result.data?.updatedWeapons ?? [];
        useConfigStore.setState(state => {
          const weapons = {
            ...state.values.weapons
          };
          for (const name of updated) weapons[name] = {
            ...weapons[name],
            [category]: {
              ...weapons[name]?.[category],
              ...weaponValues[name]
            }
          };
          const values = {
            ...state.values,
            weapons
          };
          return {
            values,
            workingValues: values,
            savedValues: values
          };
        });
        if (!response.ok || !result.success) throw new Error(result.error || 'Some changes could not be saved. Successfully saved changes remain staged.');
      }
      toast.success(`Staged ${total} changes to ${entry.configKey}`);
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setStaging(false);
    }
  };
  return <Dialog open onOpenChange={open => {
    if (!open && !staging) onClose();
  }}><DialogContent className="console-sheet sweep-sheet" onInteractOutside={event => {
      if (staging) event.preventDefault();
    }}>
    <DialogHeader className="sheet-header"><DialogDescription>Bulk edit · {groups.join(' · ')}</DialogDescription><DialogTitle>{entry.configKey}</DialogTitle></DialogHeader>
    <div className="sweep-controls"><div className="sweep-control-row"><div className="mode-control">{(entry.dataType === DataType.Float ? ['set', 'multiply', 'add'] as const : ['set'] as const).map(item => <button key={item} disabled={staging} className={mode === item ? 'selected' : ''} onClick={() => switchMode(item)}>{item === 'set' ? 'Set to' : item === 'multiply' ? 'Multiply by' : 'Add'}</button>)}</div><div className="sweep-value"><span>{mode === 'set' ? '=' : mode === 'multiply' ? '×' : '+'}</span><ValueEditor key={mode} entry={entry} value={value} onChange={setValue} label="Sweep value" disabled={staging} debounceMs={0} /></div></div><div className="sweep-control-row"><p>{rows.filter(row => row.changes > 0).length} of {rows.filter(row => row.enabled).length} selected weapons change · {groups.length} attack type{groups.length > 1 ? 's' : ''} each</p><div className="selection-buttons"><button disabled={staging} onClick={() => setSelected(new Set(weapons))}>All</button><button disabled={staging} onClick={() => setSelected(new Set(rows.filter(row => row.before.some(isOverride)).map(row => row.name)))}>Overridden only</button><button disabled={staging} onClick={() => setSelected(new Set())}>None</button></div></div>
    {mode !== 'set' && untouched > 0 && <div className="untouched-notice"><p>{base === undefined ? `${untouched} untouched weapons have no stored value to ${mode === 'multiply' ? 'multiply' : 'add to'}. They're skipped unless you give a base.` : `${untouched} untouched weapons will be treated as ${base} before the operation. Verify against the game before relying on it.`}</p><label>Treat untouched as<input type="number" step="any" value={assume} disabled={staging} onChange={event => setAssume(event.target.value)} placeholder="Base value" /></label></div>}</div>
    <div className="sweep-list"><div className="sweep-row sweep-heading"><span /><span>Weapon</span><span>Stored value</span><span /><span>After</span><span>Status</span></div>{rows.map(row => <div key={row.name} className={`sweep-row${row.enabled ? '' : ' unselected'}`}><Checkbox aria-label={`Select ${row.name}`} checked={row.enabled} disabled={row.noBase || staging} onCheckedChange={checked => setSelected(previous => {
            const next = new Set(previous);
            if (checked) next.add(row.name);else next.delete(row.name);
            return next;
          })} /><span className="sweep-weapon">{row.name}</span><span className={row.before.some(isOverride) ? 'mono' : 'faint'} title={summary(row.before, 'mixed')}>{summary(row.before, 'mixed')}</span><span className="faint">→</span><span className={`mono${row.changes ? ' green' : ''}`} title={summary(row.after, 'varies')}>{row.enabled && isOverride(value) ? summary(row.after, 'varies') : '—'}</span><span className={row.noBase ? 'amber' : row.changes ? 'green' : 'faint'}>{row.noBase ? 'no base value' : !row.enabled ? 'skipped' : row.changes ? 'will change' : 'no change'}</span></div>)}</div>
    <footer className="sheet-footer"><p>Stages changes locally. Nothing reaches the server until Review &amp; apply.</p><div><button className="outline-button" disabled={staging} onClick={onClose}>Cancel</button><button className="primary-button" disabled={!total || staging} onClick={stage}>{staging ? 'Staging…' : `Stage ${total} changes`}</button></div></footer>
  </DialogContent></Dialog>;
}
