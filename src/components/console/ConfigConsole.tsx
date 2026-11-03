'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Sword, Search, Check, X, MessageCircle, UserPlus, Users, Server, PackageCheck, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { AccountMenu, AuthGate } from '@/components/auth';
import { Logo } from '@/components/Logo';
import { InvitesPage, ServerOwnersPage, StatusPage, SupportedBuildPage } from '@/components/operator';
import { GameServersTab } from '@/components/game-servers';
import { RulesetsTab } from '@/components/rulesets';
import { NotesDialog } from '@/components/notes';
import { Switch } from '@/components/ui/switch';
import { useConfigStore, flushConfigWrites, fieldName, editName, type ConfigState } from '@/lib/store/configStore';
import { useSessionStore } from '@/lib/store';
import { WEAPON_CONFIG_OPTIONS } from '@/lib/config/weaponConfigSchema';
import { CHARACTER_CONFIG_OPTIONS, CharacterConfigGroupName } from '@/lib/config/characterConfigSchema';
import { supportsWeapon, type ConfigEntry } from '@/lib/config/types';
import { useNotes } from '@/lib/hooks';
import { ValueEditor } from './ValueEditor';
import { DraftBar, overridesText } from './DraftBar';
import { SweepPanel } from './SweepPanel';
import { GlobalSearch } from './GlobalSearch';
import type { SearchDestination } from './search';
import { attackGroups, weapons, countEntries, countGroups, countOverrides, holdNumberForWheel, isOverride, showValue, toggleAttackGroup } from './model';
import { parrySections } from './parry-sections';
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
  onSweep,
  highlighted
}: {
  entry: ConfigEntry;
  database: string;
  groups: string[];
  values: ConfigState['values'];
  onSweep: (entry: ConfigEntry) => void;
  highlighted: boolean;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const {
    notes,
    addNote,
    editNote,
    deleteNote
  } = useNotes({
    database: database === 'Character' ? 'Character' : 'Weapon',
    configKey: entry.configKey
  });
  const setValue = useConfigStore(state => state.setValue);
  const removeValue = useConfigStore(state => state.removeValue);
  const fieldErrors = useConfigStore(state => state.fieldErrors);
  const categories = database === 'Character' ? values.character : values.weapons[database];
  const rowValues = groups.map(group => categories?.[group]?.[entry.configKey]);
  const overridden = rowValues.some(isOverride);
  const first = rowValues.find(isOverride);
  const muted = !!entry.gatedBy && categories?.[groups[0]]?.[entry.gatedBy] !== true;
  return <>
    <div role="row" tabIndex={-1} data-config-key={entry.configKey} className={`config-grid config-row${overridden ? ' has-override' : ''}${muted ? ' feature-muted' : ''}${highlighted ? ' search-destination' : ''}`} title={muted ? 'Feature parameter: stored and sent, but only read while the feature toggle is on.' : undefined}>
      <div role="cell" className="key-cell"><div className="key-label"><span title={entry.documentation || entry.configKey}>{entry.label ?? entry.configKey}</span>{entry.isFeatureToggle && <span className="feature-badge">feature</span>}<button className={`notes-button${notes.length ? ' has-notes' : ''}`} title={notes.length ? `${notes.length} notes` : 'Add a note'} aria-label={`Notes for ${entry.configKey}`} onClick={() => setNotesOpen(true)}><MessageCircle size={12} />{notes.length || ''}</button></div>{muted && <small>needs {entry.gatedBy}</small>}</div>
      {groups.map((group, index) => <div role="cell" key={group} data-config-database={database} data-config-category={group} data-config-key={entry.configKey}><ValueEditor entry={entry} database={database} category={group} value={rowValues[index]} label={`${database} ${group} ${entry.label ?? entry.configKey}`} onChange={value => setValue(database, group, entry.configKey, value)} onReset={() => removeValue(database, group, entry.configKey)} error={fieldErrors[fieldName(database, group, entry.configKey)]} /></div>)}
      <div role="cell" className="row-actions">{groups.length > 1 && isOverride(first) && <button className="set-all" title={`Write ${showValue(first)} to ${groups.join(', ')}`} onClick={() => groups.forEach(group => setValue(database, group, entry.configKey, structuredClone(first)))}>Set all {groups.length}</button>}{database !== 'Character' && !entry.supportedWeapons && <button className="sweep-link" onClick={() => onSweep(entry)}>All weapons →</button>}</div>
    </div>
    {notesOpen && <NotesDialog open={notesOpen} onOpenChange={setNotesOpen} configKey={entry.configKey} context={database === 'Character' ? `Character · ${groups[0]}` : database} notes={notes} onAddNote={addNote} onEditNote={editNote} onDeleteNote={deleteNote} />}
  </>;
}
/** The status of the open Draft's saves, with what the owner can do about a failed one. */
function SaveStatus() {
  const draft = useConfigStore(state => state.draft);
  const saveState = useConfigStore(state => state.saveState);
  const saveError = useConfigStore(state => state.saveError);
  const retrySave = useConfigStore(state => state.retrySave);
  if (!draft) return null;
  const them = draft.dropped === 1 ? 'it' : 'them';
  const hidden = draft.dropped ? ` · ${draft.dropped} stored value${draft.dropped === 1 ? ' is' : 's are'} not shown: this build has no key or weapon for ${them}. Saves keep ${them}.` : '';
  return <p className="config-sync-status" role="status">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? draft.savedAt ? <>Draft saved <time dateTime={new Date(draft.savedAt).toISOString()} title={new Date(draft.savedAt).toLocaleString()}>{new Date(draft.savedAt).toLocaleTimeString()}</time></> : 'No saves yet' : <span className="save-problem">{saveError}</span>}{saveState === 'failed' && <button className="text-button" onClick={retrySave}>Retry</button>}{hidden}</p>;
}
/** The edits another tab's save left unsaved here, each with the value it set, until the owner dismisses them. */
function UnsavedEdits() {
  const unsaved = useConfigStore(state => state.unsaved);
  const dismiss = useConfigStore(state => state.dismissUnsaved);
  if (!unsaved.length) return null;
  const one = unsaved.length === 1;
  return <div className="unsaved-edits" role="alert"><p>The Draft changed in another tab, so {one ? 'this edit was' : `these ${unsaved.length} edits were`} not saved. The editor shows the saved Draft; make {one ? 'it' : 'them'} again to keep {one ? 'it' : 'them'}.</p><ul>{unsaved.map(edit => <li key={fieldName(edit.database, edit.category, edit.key)}>{editName(edit)} <span className="mono">→ {showValue(edit.value)}</span></li>)}</ul><button className="text-button" onClick={dismiss}>Dismiss</button></div>;
}
/** How often the open editor fetches its Draft again, to pick up another tab's saves. */
const DRAFT_REFRESH_MS = 3_000;
/** True while the owner is typing a value in the editor: a refresh waits rather than replace it. */
const typingValue = () => {
  const active = document.activeElement;
  return !!active?.closest('.config-table') && active.matches('input, select, textarea');
};
/** While the editor is showing, fetches its Draft again every few seconds the page is visible, and at once when it is shown again. */
function useDraftRefresh(showing: boolean) {
  useEffect(() => {
    if (!showing) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void useConfigStore.getState().refreshDraft(typingValue);
    };
    refresh();
    const timer = setInterval(refresh, DRAFT_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [showing]);
}
/** The wheel scrolls past every number input on the page, those in a dialog included: it never changes a value. */
function useWheelScrollsPastNumbers() {
  useEffect(() => {
    const options = { capture: true, passive: true };
    document.addEventListener('wheel', holdNumberForWheel, options);
    return () => document.removeEventListener('wheel', holdNumberForWheel, options);
  }, []);
}
function ConsoleContent() {
  useWheelScrollsPastNumbers();
  const [tab, setTab] = useState('servers');
  // The game server whose Draft the editor has open, and the game server page to show when going back to it.
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [serverPage, setServerPage] = useState<number | undefined>();
  const [weapon, setWeapon] = useState<string>('ArmingSword');
  const [charGroup, setCharGroup] = useState(characterGroups[0]);
  const [groups, setGroups] = useState<string[]>(['Strike']);
  const [query, setQuery] = useState('');
  const [searchDestination, setSearchDestination] = useState<SearchDestination | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [sweep, setSweep] = useState<ConfigEntry | null>(null);
  const values = useConfigStore(state => state.values);
  const draft = useConfigStore(state => state.draft);
  const loading = useConfigStore(state => state.loading);
  const loadError = useConfigStore(state => state.loadError);
  const ready = !!draft && !loading;
  const operator = useSessionStore(state => state.user?.operator ?? false);
  const isCharacter = tab === 'character';
  const configScreen = (tab === 'weapons' || isCharacter) && editing !== null;
  useDraftRefresh(configScreen);
  const database = isCharacter ? 'Character' : weapon;
  const visibleGroups = isCharacter ? [charGroup] : groups;
  const title = isCharacter ? charGroup : weapon;
  const options: ConfigEntry[] = isCharacter
    ? CHARACTER_CONFIG_OPTIONS[charGroup]
    : WEAPON_CONFIG_OPTIONS[groups[0] === 'General' ? 'General' : 'Attack'].filter(entry => supportsWeapon(entry, weapon));
  const rows = [...options].sort((a, b) => {
    // Keep each feature together, with its toggle before the parameters it gates.
    const featureOrder = (a.gatedBy || a.configKey).localeCompare(b.gatedBy || b.configKey);
    return featureOrder || Number(!!a.gatedBy) - Number(!!b.gatedBy) || a.configKey.localeCompare(b.configKey);
  });
  const rowSections = isCharacter && charGroup === CharacterConfigGroupName.Parry
    ? parrySections(rows) : [{ title: '', entries: rows }];
  const weaponCount = Object.values(values.weapons).filter(groups => countGroups(groups) > 0).length;
  const total = countOverrides(values);
  const count = (name: string) => isCharacter ? countEntries(values.character[name]) : countGroups(values.weapons[name]);
  const items = (isCharacter ? characterGroups : weapons).filter(name => name.toLowerCase().includes(query.toLowerCase()) && (isCharacter || !onlyOverrides || count(name) > 0));
  const selectTab = (next: string) => {
    setTab(next);
    setQuery('');
    setSearchDestination(null);
    setServerPage(undefined);
  };
  const editDraft = (server: { id: number; name: string }) => {
    setEditing(server);
    void useConfigStore.getState().openDraft(server.id);
    selectTab('character');
  };
  const reopenDraft = () => {
    if (editing) void useConfigStore.getState().openDraft(editing.id);
  };
  const showServerPage = () => {
    selectTab('servers');
    setServerPage(editing?.id);
  };
  const navigateSearch = (destination: SearchDestination) => {
    selectTab(destination.tab);
    setOnlyOverrides(false);
    setSweep(null);
    if (destination.weapon) setWeapon(destination.weapon);
    if (destination.group) {
      if (destination.tab === 'character') setCharGroup(destination.group as CharacterConfigGroupName);
      else setGroups([destination.group]);
    }
    setSearchDestination({ ...destination });
  };
  useEffect(() => {
    if (!searchDestination || loading || loadError) return;
    const target = searchDestination.configKey
      ? contentRef.current?.querySelector<HTMLElement>(`[data-config-key="${CSS.escape(searchDestination.configKey)}"]`)
      : contentRef.current?.querySelector<HTMLElement>('h1');
    if (!target) return;
    if (!searchDestination.configKey) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [searchDestination, loading, loadError]);
  const globalSearch = <GlobalSearch weapon={weapon} onSelect={navigateSearch} />;
  const resetScope = async () => {
    const store = useConfigStore.getState();
    const categories = isCharacter ? {
      [charGroup]: store.values.character[charGroup]
    } : store.values.weapons[weapon];
    store.setValues(Object.entries(categories ?? {}).flatMap(([category, entries]) => Object.keys(entries ?? {}).map(key => ({ database, category, key, value: null }))));
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
        id: 'rulesets',
        label: 'Rulesets',
        icon: <Bookmark />
      }, {
        id: 'servers',
        label: 'Game servers',
        icon: <Server />
      }, ...(operator ? [{
        id: 'invites',
        label: 'Invites',
        icon: <UserPlus />
      }, {
        id: 'server-owners',
        label: 'Server owners',
        icon: <Users />
      }, {
        id: 'supported-build',
        label: 'Supported build',
        icon: <PackageCheck />
      }, {
        id: 'status',
        label: 'Status',
        icon: <Activity />
      }] : [])].map(item => <button key={item.id} title={item.label} aria-label={item.label} aria-current={tab === item.id ? 'page' : undefined} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}>{item.icon}</button>)}<AccountMenu /></nav>
    {configScreen ? <>
      <aside className="config-sidebar"><div className="sidebar-header"><div className="sidebar-title"><h2>{isCharacter ? 'Groups' : 'Weapons'}</h2><span>{isCharacter ? `${countGroups(values.character)} override${countGroups(values.character) === 1 ? '' : 's'}` : `${weaponCount} with overrides`}</span></div><SearchField value={query} onChange={setQuery} placeholder="Filter" />{!isCharacter && <label className="override-filter"><Switch checked={onlyOverrides} onCheckedChange={setOnlyOverrides} /><span>Only with overrides</span></label>}</div><div className="sidebar-list">{items.map(name => <button key={name} className={name === title ? 'selected' : ''} aria-current={name === title ? 'true' : undefined} onClick={() => isCharacter ? setCharGroup(name as CharacterConfigGroupName) : setWeapon(name)}><span>{name}</span>{count(name) > 0 && <b>{count(name)}</b>}</button>)}{!items.length && <p className="empty-state">{onlyOverrides && !isCharacter ? 'No weapons with overrides match' : 'No matches'}</p>}</div></aside>
      <section className="config-content" ref={contentRef}><header className="config-header"><div className="content-heading"><div><p className="crumb"><button className="crumb-link" onClick={showServerPage}>{editing?.name}</button> · Draft · {isCharacter ? 'Character' : 'Weapons'}</p><h1>{title}</h1></div><div className="header-actions">{globalSearch}<button className="outline-button" disabled={!ready} onClick={resetScope}>Reset {isCharacter ? 'group' : 'weapon'}</button></div></div>{isCharacter ? <p className="character-hint">Server-wide values. Rows marked feature are toggles; the parameters under them are stored and sent regardless, but the mod only reads them while the toggle is on.</p> : <div className="attack-toolbar"><div className="attack-chips">{attackGroups.map(group => {
                const n = countEntries(values.weapons[weapon]?.[group]);
                return <button key={group} className={groups.includes(group) ? 'selected' : ''} aria-pressed={groups.includes(group)} onClick={() => setGroups(toggleAttackGroup(groups, group))}>{group !== 'General' && <span className="chip-checkbox">{groups.includes(group) && <Check size={9} />}</span>}{group}{n > 0 && <b>{n}</b>}</button>;
              })}</div><span>{groups[0] === 'General' ? 'General has its own keys' : `${groups.length} of 4 attack types shown`}</span></div>}<SaveStatus /><UnsavedEdits /></header>
      <div className="config-scroll">{loading ? <p className="empty-state">Loading the Draft…</p> : loadError || !draft ? <div className="empty-state" role="alert">{loadError || 'The Draft is not open.'} <button className="outline-button" onClick={reopenDraft}>Retry</button></div> : <div className="config-table" role="table" aria-label={`${title} configuration`} style={{
            '--columns': visibleGroups.length
          } as React.CSSProperties}><div className="config-table-inner"><div className="config-grid table-heading" role="row"><span role="columnheader">Config key</span>{visibleGroups.map(group => <span role="columnheader" key={group}>{isCharacter ? 'Value' : group}{visibleGroups.length > 1 && <button className="icon-button" aria-label={`Hide ${group}`} onClick={() => setGroups(toggleAttackGroup(groups, group))}><X size={12} /></button>}</span>)}<span role="columnheader" className="sr-only">Actions</span></div>{rowSections.map(section => <div role="rowgroup" key={section.title}>{section.title && <div role="row" className="config-section-heading"><div role="cell" aria-colspan={visibleGroups.length + 2}><h2>{section.title}</h2></div></div>}{section.entries.map(entry => <KeyRow key={`${database}/${visibleGroups.join('/')}/${entry.configKey}`} entry={entry} database={database} groups={visibleGroups} values={values} onSweep={setSweep} highlighted={searchDestination?.configKey === entry.configKey && searchDestination.tab === tab && searchDestination.group === visibleGroups[0] && (isCharacter || searchDestination.weapon === weapon)} />)}</div>)}{rows.length === 0 && <p className="empty-state">No keys in this group</p>}</div></div>}</div>
      {editing && <DraftBar server={editing} overrides={overridesText(total)} onShowServer={showServerPage} />}</section>
    </> : <section className="standalone-page" ref={contentRef}><div className="header-actions standalone-search">{globalSearch}</div>{tab === 'rulesets' ? <RulesetsTab /> : tab === 'servers' ? <GameServersTab initialOpenId={serverPage} onEditDraft={editDraft} /> : tab === 'invites' && operator ? <InvitesPage /> : tab === 'server-owners' && operator ? <ServerOwnersPage /> : tab === 'supported-build' && operator ? <SupportedBuildPage /> : tab === 'status' && operator ? <StatusPage /> : tab === 'character' || tab === 'weapons' ? <div className="game-servers-page"><div className="standalone-heading"><div><h1>{isCharacter ? 'Character' : 'Weapons'}</h1><p className="page-description">The editor works on one game server&apos;s Draft. Open a game server and choose Edit Draft.</p></div></div><button className="primary-button" onClick={() => selectTab('servers')}>Game servers</button></div> : null}</section>}
    {sweep && <SweepPanel entry={sweep} weapon={weapon} groups={groups} onClose={() => setSweep(null)} />}
  </main>;
}
export function ConfigConsole() {
  return <AuthGate><ConsoleContent /></AuthGate>;
}
