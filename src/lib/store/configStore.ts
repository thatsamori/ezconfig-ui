import { create } from 'zustand';
import { toast } from 'sonner';
import type { PresetData } from '@/lib/presets/types';
import { assertCameraPolicy } from '@/lib/config/cameraPolicyValidation';
import { valuesDocument, type FieldError } from '@/lib/config/valuesDocument';
import { getSchemaForCategory, validateConfigEntry } from '@/lib/database/validation';

// Config values can be various types from the schema
// null in an edit is Reset: the key is removed (back to the game default)
export type ConfigValue = boolean | number | string | number[] | { x: number; y: number } | { x: number; y: number; z: number } | null;

export type DraftValues = {
  character: Record<string, Record<string, ConfigValue>>; // category -> key -> value
  weapons: Record<string, Record<string, Record<string, ConfigValue>>>; // weapon -> category -> key -> value
};

/** The open Draft's last save: saved, saving, refused by the schema, stale (changed elsewhere) or not delivered. */
export type SaveState = 'saved' | 'saving' | 'invalid' | 'stale' | 'failed';

export interface OpenDraft {
  gameServerId: number;
  revision: number;
  savedAt: number | null;
  /** Stored values the schema has no place for: not shown, and kept by every save. */
  dropped: number;
}

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
  /** Replace the whole Draft with a preset's values. */
  loadPreset: (presetData: PresetData) => Promise<void>;
  /** Empty the Draft, with its revision checked. */
  resetToGameDefaults: () => Promise<void>;
}

export const fieldName = (database: string, category: string | undefined, key: string) => `${database}/${category ?? ''}/${key}`;

const STALE = 'This Draft changed in another tab or by someone else since this page loaded it. Reload the Draft to keep editing.';
const emptyValues = (): DraftValues => ({ character: {}, weapons: {} });

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

/**
 * Auto-save. Every save sends the whole Draft with the revision it was based
 * on, one at a time, so edits made while one is in flight go in the next.
 */
let saving: Promise<void> | null = null;
let pending = false;
let opening = 0;

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
    const { draft, values, saveState } = useConfigStore.getState();
    // A stale Draft takes no saves until it is reloaded (online-platform#31 handles that in the tab).
    if (!draft || saveState === 'stale') return;
    useConfigStore.setState({ saveState: 'saving' });
    let status = 0;
    let body: { error?: string; details?: FieldError[]; data?: { revision: number; savedAt: number | null } } = {};
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
        draft: state.draft && { ...state.draft, revision: body.data!.revision, savedAt: body.data!.savedAt },
        saveState: pending ? 'saving' : 'saved', saveError: '', fieldErrors: {},
      }));
    } else if (status === 400 && body.details?.length) {
      const [first, ...rest] = body.details;
      const saveError = `Not saved: ${first.key} ${first.error}${rest.length ? ` (and ${rest.length} more)` : ''}`;
      useConfigStore.setState({ saveState: 'invalid', saveError, fieldErrors: Object.fromEntries(body.details.map(error => [fieldName(error.database, error.category, error.key), error.error])) });
      toast.error(saveError);
    } else if (status === 409) {
      useConfigStore.setState({ saveState: 'stale', saveError: STALE });
      toast.error(STALE);
      return;
    } else {
      const saveError = body.error || (status ? `Could not save the Draft (${status})` : 'Could not reach the platform to save the Draft');
      useConfigStore.setState({ saveState: 'failed', saveError });
      toast.error(saveError);
    }
  }
}

/** Wait for the Draft's saves; rejects when the last one was not saved. */
export async function flushConfigWrites(): Promise<void> {
  while (saving) await saving;
  const { saveState, saveError } = useConfigStore.getState();
  if (saveState !== 'saved') throw new Error(saveError || 'Some changes could not be saved. Retry the edits before continuing.');
}

async function settled() {
  while (saving) await saving.catch(() => {});
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  values: emptyValues(),
  draft: null,
  loading: false,
  loadError: '',
  saveState: 'saved',
  saveError: '',
  fieldErrors: {},

  openDraft: async (gameServerId) => {
    const token = ++opening;
    await settled();
    if (token !== opening) return;
    pending = false;
    set({ values: emptyValues(), draft: null, loading: true, loadError: '', saveState: 'saved', saveError: '', fieldErrors: {} });
    try {
      const response = await fetch(`/api/game-servers/${gameServerId}/draft`);
      const body = await response.json().catch(() => ({})) as { error?: string; data?: { values: DraftValues; revision: number; savedAt: number | null; dropped: number } };
      if (token !== opening) return;
      if (!response.ok || !body.data) {
        set({ loading: false, loadError: body.error || `Could not load the Draft (${response.status})` });
        return;
      }
      const { values, revision, savedAt, dropped } = body.data;
      set({ values, draft: { gameServerId, revision, savedAt, dropped }, loading: false });
    } catch {
      if (token === opening) set({ loading: false, loadError: 'Could not reach the platform to load the Draft' });
    }
  },

  closeDraft: () => {
    opening++;
    pending = false;
    set({ values: emptyValues(), draft: null, loading: false, loadError: '', saveState: 'saved', saveError: '', fieldErrors: {} });
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

  loadPreset: async (presetData) => {
    assertCameraPolicy(presetData.character.Camera);
    if (!get().draft) throw new Error('Open a game server to load a preset into its Draft');
    await settled();
    set({ values: { character: structuredClone(presetData.character), weapons: structuredClone(presetData.weapons) } });
    requestSave();
    await flushConfigWrites();
  },

  resetToGameDefaults: async () => {
    await settled();
    const { draft } = get();
    if (!draft) return;
    const response = await fetch(`/api/game-servers/${draft.gameServerId}/draft/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: draft.revision }),
    }).catch(() => {
      throw new Error('Could not reach the platform to reset the Draft');
    });
    const body = await response.json().catch(() => ({})) as { error?: string; data?: { values: DraftValues; revision: number; savedAt: number | null; dropped: number } };
    if (get().draft?.gameServerId !== draft.gameServerId) return;
    if (response.status === 409) {
      set({ saveState: 'stale', saveError: STALE });
      throw new Error(STALE);
    }
    if (!response.ok || !body.data) throw new Error(body.error || `Could not reset the Draft (${response.status})`);
    const { values, revision, savedAt, dropped } = body.data;
    set({ values, draft: { gameServerId: draft.gameServerId, revision, savedAt, dropped }, saveState: 'saved', saveError: '', fieldErrors: {} });
  },
}));
