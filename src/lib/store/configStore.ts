import { create } from 'zustand';
import { toast } from 'sonner';
import { valuesDocument, type FieldError } from '@/lib/config/valuesDocument';
import { getSchemaForCategory, validateConfigEntry } from '@/lib/database/validation';
import type { Origin } from '@/lib/platform/origins';
import type { RulesetVersionSummary } from '@/lib/platform/rulesets';

// Config values can be various types from the schema
// null in an edit is Reset: the key is removed (back to the game default)
export type ConfigValue = boolean | number | string | number[] | { x: number; y: number } | { x: number; y: number; z: number } | null;

export type DraftValues = {
  character: Record<string, Record<string, ConfigValue>>; // category -> key -> value
  weapons: Record<string, Record<string, Record<string, ConfigValue>>>; // weapon -> category -> key -> value
};

/** The open Draft's last save: saved, saving, refused by the schema or not delivered. */
export type SaveState = 'saved' | 'saving' | 'invalid' | 'failed';

export interface OpenDraft {
  gameServerId: number;
  revision: number;
  savedAt: number | null;
  /** Stored values the schema has no place for: not shown, and kept by every save. */
  dropped: number;
  /** The values at `revision`, as this tab last loaded or saved them: what its edits are measured against. */
  base: DraftValues;
  /** The Ruleset version the Draft was last loaded from or saved as, modified or not as of the last answer; null for none. */
  origin: Origin | null;
}

/** The Draft as the platform sends it: on load, after a reset or a Ruleset write, and with a stale write's refusal. */
type DraftView = { values: DraftValues; revision: number; savedAt: number | null; dropped: number; origin: Origin | null };

/** Where Save as Ruleset version puts the Draft: the next version of a Ruleset, or version 1 of a new one. */
export type VersionTarget = { rulesetId: number } | { name: string };

export type ValueChange = { database: string; category: string; key: string; value: ConfigValue };

export interface ConfigState {
  /** The open Draft's values, under their keys' current categories. */
  values: DraftValues;
  draft: OpenDraft | null;
  loading: boolean;
  loadError: string;
  saveState: SaveState;
  saveError: string;
  /** The last refused save's errors, by fieldName(database, category, key). */
  fieldErrors: Record<string, string>;
  /** Edits made here that another tab's save left unsaved, named until dismissed; a null value was a Reset. */
  unsaved: ValueChange[];

  /** Load a game server's Draft into the editor, once the open one's saves finish. */
  openDraft: (gameServerId: number) => Promise<void>;
  closeDraft: () => void;
  setValue: (database: string, category: string, key: string, value: ConfigValue) => void;
  /** Reset to the game default: the key leaves the Draft. */
  removeValue: (database: string, category: string, key: string) => void;
  /** Several edits in one save, as a sweep makes them; a null value is Reset. */
  setValues: (changes: ValueChange[]) => void;
  getValue: (database: string, category: string, key: string) => ConfigValue | undefined;
  /** Retry a save that did not reach the server. */
  retrySave: () => void;
  /** Save the Draft, once its edits are saved, as a Ruleset version, which becomes its origin; with its revision checked. */
  saveRulesetVersion: (target: VersionTarget, description: string) => Promise<{ ruleset: { id: number; name: string }; version: RulesetVersionSummary }>;
  /**
   * Replace the whole Draft with a Ruleset version's values, with its revision
   * checked: `dropped` counts the values this build has no place for, `errors`
   * the loaded values it refuses.
   */
  loadRulesetVersion: (versionId: number) => Promise<{ dropped: number; errors: FieldError[] }>;
  /** Empty the Draft, with its revision checked. */
  resetToGameDefaults: () => Promise<void>;
  /**
   * Fetch the open Draft again and take another tab's saves. Skipped while an
   * edit is saving or being typed (`typing`); edits here that never saved are
   * named, as a rejected save names them.
   */
  refreshDraft: (typing?: () => boolean) => Promise<void>;
  dismissUnsaved: () => void;
}

export const fieldName = (database: string, category: string | undefined, key: string) => `${database}/${category ?? ''}/${key}`;
/** How an edit is named to the owner: Character or the weapon, then its category and key. */
export const editName = ({ database, category, key }: Omit<ValueChange, 'value'>) => `${database} · ${category} · ${key}`;

const emptyValues = (): DraftValues => ({ character: {}, weapons: {} });
const notSaved = (lost: readonly ValueChange[]) =>
  `The Draft changed in another tab, so ${lost.length === 1 ? 'an edit here was' : `${lost.length} edits here were`} not saved: ${lost.slice(0, 3).map(editName).join(', ')}${lost.length > 3 ? ` and ${lost.length - 3} more` : ''}.`;

/** The values with each change made: set, or removed with any emptied category and weapon. */
function withChanges(values: DraftValues, changes: readonly ValueChange[]): DraftValues {
  const next: DraftValues = { character: { ...values.character }, weapons: { ...values.weapons } };
  for (const { database, category, key, value } of changes) {
    const categories = database === 'Character' ? next.character : (next.weapons[database] = { ...next.weapons[database] });
    const entries = categories[category] = { ...categories[category] };
    if (value === null) delete entries[key];
    else entries[key] = value;
    if (!Object.keys(entries).length) delete categories[category];
    if (database !== 'Character' && !Object.keys(categories).length) delete next.weapons[database];
  }
  return next;
}

/** Every value in `values`, by fieldName. */
function fields(values: DraftValues): Map<string, ValueChange> {
  const all = new Map<string, ValueChange>();
  const add = (database: string, categories: DraftValues['character']) => {
    for (const [category, entries] of Object.entries(categories)) for (const [key, value] of Object.entries(entries)) all.set(fieldName(database, category, key), { database, category, key, value });
  };
  add('Character', values.character);
  for (const [weapon, categories] of Object.entries(values.weapons)) add(weapon, categories);
  return all;
}

/** The edits made here (`values` against `base`) that the platform's `current` values do not have. */
function lostEdits(base: DraftValues, values: DraftValues, current: DraftValues): ValueChange[] {
  const [before, after, now] = [fields(base), fields(values), fields(current)];
  const same = (a?: ValueChange, b?: ValueChange) => JSON.stringify(a?.value) === JSON.stringify(b?.value);
  return [...new Set([...after.keys(), ...before.keys()])]
    .filter(name => !same(before.get(name), after.get(name)) && !same(after.get(name), now.get(name)))
    .map(name => after.get(name) ?? { ...before.get(name)!, value: null });
}

/** The open Draft as the platform sent it. */
const opened = (gameServerId: number, { values, revision, savedAt, dropped, origin }: DraftView): OpenDraft => ({ gameServerId, revision, savedAt, dropped, base: values, origin });

/**
 * Take the Draft as the platform has it now, in place of this tab's. The edits
 * here it does not have are named until dismissed, and returned. There is no
 * per-key merge.
 */
function adopt(gameServerId: number, view: DraftView): ValueChange[] {
  const { draft, values, unsaved } = useConfigStore.getState();
  const lost = draft ? lostEdits(draft.base, values, view.values) : [];
  const names = new Set(lost.map(edit => fieldName(edit.database, edit.category, edit.key)));
  pending = false;
  useConfigStore.setState({
    values: view.values,
    draft: opened(gameServerId, view),
    saveState: 'saved', saveError: '', fieldErrors: {},
    unsaved: [...lost, ...unsaved.filter(edit => !names.has(fieldName(edit.database, edit.category, edit.key)))],
  });
  if (lost.length) toast.error(notSaved(lost));
  return lost;
}

/**
 * Auto-save. Every save sends the whole Draft with the revision it was based
 * on, one at a time, so edits made while one is in flight go in the next. A
 * save on a stale revision is rejected with the current Draft, which the tab
 * takes, naming the edits it lost (online-platform#31).
 */
let saving: Promise<void> | null = null;
let pending = false;
let opening = 0;
let refreshing = false;
/** Saves rejected with edits lost, and the last one's message, for flushConfigWrites. */
let rejected = { count: 0, message: '' };

function requestSave() {
  pending = true;
  if (!saving) saving = runSaves().finally(() => {
    saving = null;
    if (pending) requestSave();
  });
}

async function runSaves() {
  while (pending) {
    pending = false;
    const { draft, values } = useConfigStore.getState();
    if (!draft) return;
    useConfigStore.setState({ saveState: 'saving' });
    let status = 0;
    let body: { error?: string; details?: FieldError[]; data?: { revision: number; savedAt: number | null; origin: Origin | null } | DraftView } = {};
    try {
      const response = await fetch(`/api/game-servers/${draft.gameServerId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: draft.revision, document: valuesDocument(values) }),
      });
      status = response.status;
      body = await response.json().catch(() => ({}));
    } catch {
      // Not delivered: the next edit or Retry sends the whole Draft again.
    }
    if (useConfigStore.getState().draft?.gameServerId !== draft.gameServerId) return;
    if (status === 200 && body.data) {
      useConfigStore.setState(state => ({
        draft: state.draft && { ...state.draft, revision: body.data!.revision, savedAt: body.data!.savedAt, origin: body.data!.origin, base: values },
        saveState: pending ? 'saving' : 'saved', saveError: '', fieldErrors: {},
      }));
    } else if (status === 400 && body.details?.length) {
      const [first, ...rest] = body.details;
      const saveError = `Not saved: ${first.key} ${first.error}${rest.length ? ` (and ${rest.length} more)` : ''}`;
      useConfigStore.setState({ saveState: 'invalid', saveError, fieldErrors: Object.fromEntries(body.details.map(error => [fieldName(error.database, error.category, error.key), error.error])) });
      toast.error(saveError);
    } else if (status === 409 && body.data && 'values' in body.data) {
      const lost = adopt(draft.gameServerId, body.data);
      if (lost.length) rejected = { count: rejected.count + 1, message: notSaved(lost) };
      return;
    } else {
      const saveError = body.error || (status ? `Could not save the Draft (${status})` : 'Could not reach the platform to save the Draft');
      useConfigStore.setState({ saveState: 'failed', saveError });
      toast.error(saveError);
    }
  }
}

/** Wait for the Draft's saves; rejects when the last one was not saved, or was rejected for another tab's save. */
export async function flushConfigWrites(): Promise<void> {
  const seen = rejected.count;
  while (saving) await saving;
  if (rejected.count !== seen) throw new Error(rejected.message);
  const { saveState, saveError } = useConfigStore.getState();
  if (saveState !== 'saved') throw new Error(saveError || 'Some changes could not be saved. Retry the edits before continuing.');
}

async function settled() {
  while (saving) await saving.catch(() => {});
}

/**
 * One of the Draft writes beside auto-save (Reset, the Ruleset writes), with
 * the revision checked: the answer's data. On a stale rejection the tab takes
 * the current Draft, naming its lost edits, and this throws `stale`. Undefined
 * when another Draft was opened meanwhile.
 */
async function draftWrite<T>(gameServerId: number, path: string, body: Record<string, unknown>, verb: string, stale: string): Promise<T | undefined> {
  const response = await fetch(`/api/game-servers/${gameServerId}/draft/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    throw new Error(`Could not reach the platform to ${verb}`);
  });
  const answer = await response.json().catch(() => ({})) as { error?: string; data?: T | DraftView };
  if (useConfigStore.getState().draft?.gameServerId !== gameServerId) return undefined;
  if (response.status === 409 && answer.data && typeof answer.data === 'object' && 'values' in answer.data) {
    adopt(gameServerId, answer.data as DraftView);
    throw new Error(stale);
  }
  if (!response.ok || !answer.data) throw new Error(answer.error || `Could not ${verb} (${response.status})`);
  return answer.data as T;
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  values: emptyValues(),
  draft: null,
  loading: false,
  loadError: '',
  saveState: 'saved',
  saveError: '',
  fieldErrors: {},
  unsaved: [],

  openDraft: async (gameServerId) => {
    const token = ++opening;
    await settled();
    if (token !== opening) return;
    pending = false;
    set({ values: emptyValues(), draft: null, loading: true, loadError: '', saveState: 'saved', saveError: '', fieldErrors: {}, unsaved: [] });
    try {
      const response = await fetch(`/api/game-servers/${gameServerId}/draft`);
      const body = await response.json().catch(() => ({})) as { error?: string; data?: DraftView };
      if (token !== opening) return;
      if (!response.ok || !body.data) {
        set({ loading: false, loadError: body.error || `Could not load the Draft (${response.status})` });
        return;
      }
      set({ values: body.data.values, draft: opened(gameServerId, body.data), loading: false });
    } catch {
      if (token === opening) set({ loading: false, loadError: 'Could not reach the platform to load the Draft' });
    }
  },

  closeDraft: () => {
    opening++;
    pending = false;
    set({ values: emptyValues(), draft: null, loading: false, loadError: '', saveState: 'saved', saveError: '', fieldErrors: {}, unsaved: [] });
  },

  setValue: (database, category, key, value) => {
    const schema = getSchemaForCategory(database, category);
    if (schema && value !== null && (schema[key]?.minimum !== undefined || (database === 'Character' && category === 'Camera'))) {
      const validation = validateConfigEntry(key, value, schema);
      if (!validation.valid) {
        toast.error(`${key}: ${validation.error}`);
        return;
      }
    }
    get().setValues([{ database, category, key, value }]);
  },

  removeValue: (database, category, key) => get().setValues([{ database, category, key, value: null }]),

  setValues: (changes) => {
    if (!changes.length) return;
    set(state => ({ values: withChanges(state.values, changes) }));
    requestSave();
  },

  getValue: (database, category, key) => {
    const { values } = get();
    return database === 'Character' ? values.character[category]?.[key] : values.weapons[database]?.[category]?.[key];
  },

  retrySave: requestSave,

  saveRulesetVersion: async (target, description) => {
    if (!get().draft) throw new Error('Open a game server to save its Draft as a Ruleset version');
    // The version holds the Draft as the editor shows it: every edit is saved first.
    await flushConfigWrites();
    const { draft } = get();
    if (!draft) throw new Error('The Draft was closed');
    const saved = await draftWrite<{ ruleset: { id: number; name: string }; version: RulesetVersionSummary; draft: DraftView }>(
      draft.gameServerId, 'save-version', { revision: draft.revision, ...target, description }, 'save the Ruleset version',
      'Not saved as a Ruleset version: the Draft changed in another tab. The editor now shows it; save again to keep it.',
    );
    if (!saved) throw new Error('Another Draft was opened meanwhile');
    set({ values: saved.draft.values, draft: opened(draft.gameServerId, saved.draft), saveState: 'saved', saveError: '', fieldErrors: {} });
    return { ruleset: saved.ruleset, version: saved.version };
  },

  loadRulesetVersion: async (versionId) => {
    await settled();
    const { draft } = get();
    if (!draft) throw new Error('Open a game server to load a Ruleset version into its Draft');
    const loaded = await draftWrite<{ draft: DraftView; dropped: number; errors: FieldError[] }>(
      draft.gameServerId, 'load', { revision: draft.revision, versionId }, 'load the Ruleset version',
      'Not loaded: the Draft changed in another tab. The editor now shows it; load the version again to replace it.',
    );
    if (!loaded) throw new Error('Another Draft was opened meanwhile');
    // The loaded values this build refuses are named where they show, as a refused save names them.
    const fieldErrors = Object.fromEntries(loaded.errors.map(error => [fieldName(error.database, error.category, error.key), error.error]));
    set({ values: loaded.draft.values, draft: opened(draft.gameServerId, loaded.draft), saveState: 'saved', saveError: '', fieldErrors });
    return { dropped: loaded.dropped, errors: loaded.errors };
  },

  resetToGameDefaults: async () => {
    await settled();
    const { draft } = get();
    if (!draft) return;
    const reset = await draftWrite<DraftView>(draft.gameServerId, 'reset', { revision: draft.revision }, 'reset the Draft',
      'Not reset: the Draft changed in another tab. The editor now shows it; reset again to empty it.');
    if (!reset) return;
    set({ values: reset.values, draft: opened(draft.gameServerId, reset), saveState: 'saved', saveError: '', fieldErrors: {} });
  },

  refreshDraft: async (typing = () => false) => {
    const { draft, loading } = get();
    if (!draft || loading || saving || refreshing || typing()) return;
    const token = opening;
    refreshing = true;
    try {
      const response = await fetch(`/api/game-servers/${draft.gameServerId}/draft`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({})) as { data?: DraftView };
      // Taken only when it is newer than the tab's revision, and nothing here started saving or typing meanwhile.
      const current = get().draft;
      if (token !== opening || saving || typing() || !body.data || !current) return;
      if (body.data.revision > current.revision) adopt(draft.gameServerId, body.data);
      // A Ruleset renamed or deleted elsewhere changes the origin without a Draft write.
      else if (body.data.revision === current.revision && JSON.stringify(body.data.origin) !== JSON.stringify(current.origin)) set({ draft: { ...current, origin: body.data.origin } });
    } catch {
      // The next refresh tries again; a save that cannot reach the platform says so.
    } finally {
      refreshing = false;
    }
  },

  dismissUnsaved: () => set({ unsaved: [] }),
}));
