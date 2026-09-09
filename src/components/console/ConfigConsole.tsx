'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Sword, Users, Search, Check, X, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGate } from '@/components/auth';
import { Logo } from '@/components/Logo';
import { PresetsTab } from '@/components/presets';
import { UsersTab } from '@/components/users';
import { SavePresetDialog } from '@/components/presets/SavePresetDialog';
import { SelectiveApplyDialog } from '@/components/SelectiveApplyDialog';
import { NotesDialog } from '@/components/notes';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/lib/store';
import { useConfigStore, flushConfigWrites, type ConfigState } from '@/lib/store/configStore';
import { WEAPON_CONFIG_OPTIONS } from '@/lib/config/weaponConfigSchema';
import { CHARACTER_CONFIG_OPTIONS, CharacterConfigGroupName } from '@/lib/config/characterConfigSchema';
import type { ConfigEntry } from '@/lib/config/types';
import { useNotes } from '@/lib/hooks';
import { ValueEditor } from './ValueEditor';
import { SweepPanel } from './SweepPanel';
import { attackGroups, weapons, countEntries, countGroups, countOverrides, isOverride, showValue, toggleAttackGroup } from './model';
function Helm() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0 1 16 0v2l-2 6H6l-2-6Z" /><path d="M13 12h7M13 12v8M12 4V2" /></svg>;
}
function SearchField({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return <label className="console-search"><Search size={13} /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} /></label>;
}
const characterGroups = Object.values(CharacterConfigGroupName).filter(group => CHARACTER_CONFIG_OPTIONS[group].length > 0);
function KeyRow({
  entry,
  database,
  groups,
  values,
  onSweep
}: {
  entry: ConfigEntry;
  database: string;
  groups: string[];
  values: ConfigState['values'];
  onSweep: (entry: ConfigEntry) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const {
    notes,
    addNote,
    editNote,
    deleteNote,
    currentUsername
  } = useNotes({
    schema: database === 'Character' ? 'character' : 'weapon',
    configKey: entry.configKey
  });
  const setValue = useConfigStore(state => state.setValue);
  const removeValue = useConfigStore(state => state.removeValue);
  const categories = database === 'Character' ? values.character : values.weapons[database];
  const rowValues = groups.map(group => categories?.[group]?.[entry.configKey]);
  const overridden = rowValues.some(isOverride);
  const first = rowValues.find(isOverride);
  const muted = !!entry.gatedBy && categories?.[groups[0]]?.[entry.gatedBy] !== true;
  return <>
    <div role="row" className={`config-grid config-row${overridden ? ' has-override' : ''}${muted ? ' feature-muted' : ''}`} title={muted ? 'Feature parameter: stored and sent, but only read while the feature toggle is on.' : undefined}>
      <div role="cell" className="key-cell"><div className="key-label"><span title={entry.documentation || entry.configKey}>{entry.configKey}</span>{entry.isFeatureToggle && <span className="feature-badge">feature</span>}<button className={`notes-button${notes.length ? ' has-notes' : ''}`} title={notes.length ? `${notes.length} notes` : 'Add a note'} aria-label={`Notes for ${entry.configKey}`} onClick={() => setNotesOpen(true)}><MessageCircle size={12} />{notes.length || ''}</button></div>{muted && <small>needs {entry.gatedBy}</small>}</div>
      {groups.map((group, index) => <div role="cell" key={group}><ValueEditor entry={entry} database={database} category={group} value={rowValues[index]} label={`${database} ${group} ${entry.configKey}`} onChange={value => setValue(database, group, entry.configKey, value)} onReset={() => removeValue(database, group, entry.configKey)} /></div>)}
      <div role="cell" className="row-actions">{groups.length > 1 && isOverride(first) && <button className="set-all" title={`Write ${showValue(first)} to ${groups.join(', ')}`} onClick={() => groups.forEach(group => setValue(database, group, entry.configKey, structuredClone(first)))}>Set all {groups.length}</button>}{database !== 'Character' && <button className="sweep-link" onClick={() => onSweep(entry)}>All weapons →</button>}</div>
    </div>
    {notesOpen && <NotesDialog open={notesOpen} onOpenChange={setNotesOpen} configKey={entry.configKey} context={database === 'Character' ? `Character · ${groups[0]}` : database} notes={notes} onAddNote={addNote} onEditNote={editNote} onDeleteNote={deleteNote} currentUsername={currentUsername} />}
  </>;
}
function ConsoleContent() {
  const [tab, setTab] = useState('character');
  const [weapon, setWeapon] = useState<string>('ArmingSword');
  const [charGroup, setCharGroup] = useState(characterGroups[0]);
  const [groups, setGroups] = useState<string[]>(['Strike']);
  const [query, setQuery] = useState('');
  const [keyQuery, setKeyQuery] = useState('');
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sweep, setSweep] = useState<ConfigEntry | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const values = useConfigStore(state => state.values);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/databases/overrides').then(async response => {
      if (!response.ok) throw new Error('Could not load saved overrides.');
      const data = await response.json();
      if (!data.success || !data.values) throw new Error('Could not load saved overrides.');
      if (cancelled) return;
      const values = data.values as ConfigState['values'];
      useConfigStore.setState({
        values,
        savedValues: values,
        workingValues: values,
        loadedCategories: new Set([...weapons.flatMap(name => attackGroups.map(group => `${name}/${group}`)), ...characterGroups.map(group => `Character/${group}`)])
      });
      setLoadError('');
    }).catch(error => {
      if (!cancelled) setLoadError(error.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  const isCharacter = tab === 'character';
  const configScreen = tab === 'weapons' || isCharacter;
  const database = isCharacter ? 'Character' : weapon;
  const visibleGroups = isCharacter ? [charGroup] : groups;
  const title = isCharacter ? charGroup : weapon;
  const options: ConfigEntry[] = isCharacter ? CHARACTER_CONFIG_OPTIONS[charGroup] : WEAPON_CONFIG_OPTIONS[groups[0] === 'General' ? 'General' : 'Attack'];
  const rows = [...options].filter(entry => entry.configKey.toLowerCase().includes(keyQuery.toLowerCase())).sort((a, b) => {
    // Keep each feature together, with its toggle before the parameters it gates.
    const featureOrder = (a.gatedBy || a.configKey).localeCompare(b.gatedBy || b.configKey);
    return featureOrder || Number(!!a.gatedBy) - Number(!!b.gatedBy) || a.configKey.localeCompare(b.configKey);
  });
  const weaponCount = Object.values(values.weapons).filter(groups => countGroups(groups) > 0).length;
  const total = countOverrides(values);
  const count = (name: string) => isCharacter ? countEntries(values.character[name]) : countGroups(values.weapons[name]);
  const items = (isCharacter ? characterGroups : weapons).filter(name => name.toLowerCase().includes(query.toLowerCase()) && (isCharacter || !onlyOverrides || count(name) > 0));
  const selectTab = (next: string) => {
    setTab(next);
    setQuery('');
    setKeyQuery('');
  };
  const resetScope = async () => {
    const store = useConfigStore.getState();
    const categories = isCharacter ? {
      [charGroup]: store.values.character[charGroup]
    } : store.values.weapons[weapon];
    for (const [group, entries] of Object.entries(categories ?? {})) for (const key of Object.keys(entries ?? {})) store.removeValue(database, group, key);
    try {
      await flushConfigWrites();
      toast.success(`${title} back to game defaults`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return <main className={`console-shell${configScreen ? '' : ' wide-page'}`}>
    <nav className="icon-rail" aria-label="Main navigation"><Logo />{[{
        id: 'character',
        label: 'Character',
        icon: <Helm />
      }, {
        id: 'weapons',
        label: 'Weapons',
        icon: <Sword />
      }, {
        id: 'presets',
        label: 'Presets',
        icon: <Bookmark />
      }, ...(user?.role === 'admin' ? [{
        id: 'users',
        label: 'Users',
        icon: <Users />
      }] : [])].map(item => <button key={item.id} title={item.label} aria-label={item.label} aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}>{item.icon}</button>)}<button className="rail-avatar" title={`Sign out ${user?.username ?? ''}`} aria-label="Sign out" onClick={logout}>{user?.username.slice(0, 1).toUpperCase()}</button></nav>
    {configScreen ? <>
      <aside className="config-sidebar"><div className="sidebar-header"><div className="sidebar-title"><h2>{isCharacter ? 'Groups' : 'Weapons'}</h2><span>{isCharacter ? `${countGroups(values.character)} overrides` : `${weaponCount} with overrides`}</span></div><SearchField value={query} onChange={setQuery} placeholder="Filter" />{!isCharacter && <label className="override-filter"><Switch checked={onlyOverrides} onCheckedChange={setOnlyOverrides} /><span>Only with overrides</span></label>}</div><div className="sidebar-list">{items.map(name => <button key={name} className={name === title ? 'selected' : ''} aria-current={name === title ? 'true' : undefined} onClick={() => isCharacter ? setCharGroup(name as CharacterConfigGroupName) : setWeapon(name)}><span>{name}</span>{count(name) > 0 && <b>{count(name)}</b>}</button>)}{!items.length && <p className="empty-state">{onlyOverrides && !isCharacter ? 'No weapons with overrides match' : 'No matches'}</p>}</div></aside>
      <section className="config-content"><header className="config-header"><div className="content-heading"><div><p className="crumb">{isCharacter ? 'Character' : 'Weapons'}</p><h1>{title}</h1></div><div className="header-actions"><SearchField value={keyQuery} onChange={setKeyQuery} placeholder="Search config keys" /><button className="outline-button" disabled={loading || !!loadError} onClick={resetScope}>Reset {isCharacter ? 'group' : 'weapon'}</button></div></div>{isCharacter ? <p className="character-hint">Server-wide values. Rows marked feature are toggles; the parameters under them are stored and sent regardless, but the mod only reads them while the toggle is on.</p> : <div className="attack-toolbar"><div className="attack-chips">{attackGroups.map(group => {
                const n = countEntries(values.weapons[weapon]?.[group]);
                return <button key={group} className={groups.includes(group) ? 'selected' : ''} aria-pressed={groups.includes(group)} onClick={() => setGroups(toggleAttackGroup(groups, group))}>{group !== 'General' && <span className="chip-checkbox">{groups.includes(group) && <Check size={9} />}</span>}{group}{n > 0 && <b>{n}</b>}</button>;
              })}</div><span>{groups[0] === 'General' ? 'General has its own keys' : `${groups.length} of 4 attack types shown`}</span></div>}</header>
      <div className="config-scroll">{loading ? <p className="empty-state">Loading saved overrides…</p> : loadError ? <div className="empty-state" role="alert">{loadError} <button className="outline-button" onClick={() => {
              setLoading(true);
              setReload(n => n + 1);
            }}>Retry</button></div> : <div className="config-table" role="table" aria-label={`${title} configuration`} style={{
            '--columns': visibleGroups.length
          } as React.CSSProperties}><div className="config-table-inner"><div className="config-grid table-heading" role="row"><span role="columnheader">Config key</span>{visibleGroups.map(group => <span role="columnheader" key={group}>{isCharacter ? 'Value' : group}{visibleGroups.length > 1 && <button className="icon-button" aria-label={`Hide ${group}`} onClick={() => setGroups(toggleAttackGroup(groups, group))}><X size={12} /></button>}</span>)}<span role="columnheader" className="sr-only">Actions</span></div>{rows.map(entry => <KeyRow key={`${database}/${visibleGroups.join('/')}/${entry.configKey}`} entry={entry} database={database} groups={visibleGroups} values={values} onSweep={setSweep} />)}{rows.length === 0 && <p className="empty-state">{keyQuery ? `No keys match "${keyQuery}"` : 'No keys in this group'}</p>}</div></div>}</div>
      <footer className="floating-bar"><span className={`status-dot${total ? ' changed' : ''}`} /><div className="bar-copy"><strong>{total ? `${total} unapplied changes` : 'Everything at game default'}</strong>{total > 0 && <span>across {weaponCount ? `${weaponCount} weapon${weaponCount === 1 ? '' : 's'}` : ''}{countGroups(values.character) ? `${weaponCount ? ' and ' : ''}character` : ''}</span>}</div><button className="outline-button" disabled={loading || !!loadError} onClick={() => setPresetOpen(true)}>Save as preset</button><button className="primary-button" disabled={loading || !!loadError} onClick={() => setReviewOpen(true)}>Review &amp; apply</button></footer></section>
    </> : <section className="standalone-page">{tab === 'presets' ? <PresetsTab /> : user?.role === 'admin' ? <UsersTab /> : null}</section>}
    {sweep && <SweepPanel entry={sweep} weapon={weapon} groups={groups} onClose={() => setSweep(null)} />}
    {reviewOpen && <SelectiveApplyDialog open={reviewOpen} onOpenChange={setReviewOpen} onApplyComplete={() => {}} />}
    {presetOpen && <SavePresetDialog open={presetOpen} onOpenChange={setPresetOpen} />}
  </main>;
}
export function ConfigConsole() {
  return <AuthGate><ConsoleContent /></AuthGate>;
}
