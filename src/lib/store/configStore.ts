import { create } from 'zustand';
import { toast } from 'sonner';
import type { PresetData } from '@/lib/presets/types';

// Config values can be various types from the schema
// null is used as a tombstone to mark saved values for deletion (reset to game default)
export type ConfigValue = boolean | number | number[] | { x: number; y: number } | { x: number; y: number; z: number } | null;

export interface ConfigState {
  // Single source of truth - matches database
  values: {
    character: Record<string, Record<string, ConfigValue>>; // category -> key -> value
    weapons: Record<string, Record<string, Record<string, ConfigValue>>>; // weapon -> category -> key -> value
  };

  // Loading state per database/category
  loadedCategories: Set<string>; // "Character/Movement", "Greatsword/General"

  // Actions
  setValue: (database: string, category: string, key: string, value: ConfigValue) => void;
  removeValue: (database: string, category: string, key: string) => void;
  setBulkWeaponValue: (category: string, key: string, value: ConfigValue, weaponNames: string[]) => void;
  getValue: (database: string, category: string, key: string) => ConfigValue | undefined;
  markCategoryLoaded: (path: string) => void;
  isCategoryLoaded: (path: string) => boolean;
  clearCategory: (database: string, category: string) => void;
  loadPreset: (presetData: PresetData) => void;

  // Deprecated aliases - keep for Phase 25 UI cleanup
  hasUnsavedChanges: boolean; // Always false
  workingValues: ConfigState['values']; // Alias to values
  savedValues: ConfigState['values']; // Alias to values
  setWorkingValue: (database: string, category: string, key: string, value: ConfigValue) => void;
  setSavedValue: (database: string, category: string, key: string, value: ConfigValue) => void;
  getEffectiveValue: (database: string, category: string, key: string) => ConfigValue | undefined;
  resetWorkingValues: () => void; // No-op
  commitWorkingToSaved: () => void; // No-op
  removeWorkingValue: (database: string, category: string, key: string) => void;
  clearSavedCategory: (database: string, category: string) => void;
}

/**
 * Helper to save category entries to API
 * Fire-and-forget pattern - returns promise but callers don't need to await
 */
async function saveToApi(
  database: string,
  category: string,
  entries: Record<string, ConfigValue>
): Promise<boolean> {
  try {
    const res = await fetch(`/api/config/${database}/${category}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const initialValues = {
  character: {} as Record<string, Record<string, ConfigValue>>,
  weapons: {} as Record<string, Record<string, Record<string, ConfigValue>>>,
};

const initialState = {
  values: initialValues,
  // Deprecated aliases - must be actual state properties (not getters) for Zustand subscriptions to work
  workingValues: initialValues,
  savedValues: initialValues,
  loadedCategories: new Set<string>(),
  hasUnsavedChanges: false, // Always false in new model
};

export const useConfigStore = create<ConfigState>()((set, get) => ({
  ...initialState,

  setValue: (database, category, key, value) => {
    const isCharacter = database === 'Character';

    // Optimistic update - update local state immediately
    set((state) => {
      let newValues: ConfigState['values'];
      if (isCharacter) {
        newValues = {
          ...state.values,
          character: {
            ...state.values.character,
            [category]: {
              ...state.values.character[category],
              [key]: value,
            },
          },
        };
      } else {
        // Weapon database (database is the weapon name)
        newValues = {
          ...state.values,
          weapons: {
            ...state.values.weapons,
            [database]: {
              ...state.values.weapons[database],
              [category]: {
                ...state.values.weapons[database]?.[category],
                [key]: value,
              },
            },
          },
        };
      }
      // Update values and deprecated aliases together
      return { values: newValues, workingValues: newValues, savedValues: newValues };
    });

    // Fire-and-forget API write
    const state = get();
    const entries = isCharacter
      ? state.values.character[category] || {}
      : state.values.weapons[database]?.[category] || {};

    saveToApi(database, category, entries).then((success) => {
      if (!success) {
        toast.error(`Failed to save ${database}/${category}`);
      }
    });
  },

  removeValue: (database, category, key) => {
    const isCharacter = database === 'Character';

    // Optimistic update - update local state immediately
    set((state) => {
      let newValues: ConfigState['values'];
      if (isCharacter) {
        const categoryValues = state.values.character[category] || {};
        const { [key]: _, ...remainingKeys } = categoryValues;
        const newCharacter = {
          ...state.values.character,
          [category]: remainingKeys,
        };
        // Clean up empty category objects
        if (Object.keys(remainingKeys).length === 0) {
          delete newCharacter[category];
        }
        newValues = {
          ...state.values,
          character: newCharacter,
        };
      } else {
        const weaponCategories = state.values.weapons[database] || {};
        const categoryValues = weaponCategories[category] || {};
        const { [key]: _, ...remainingKeys } = categoryValues;
        const newWeaponCategories = {
          ...weaponCategories,
          [category]: remainingKeys,
        };
        // Clean up empty category objects
        if (Object.keys(remainingKeys).length === 0) {
          delete newWeaponCategories[category];
        }
        const newWeapons = {
          ...state.values.weapons,
          [database]: newWeaponCategories,
        };
        // Clean up empty weapon objects
        if (Object.keys(newWeaponCategories).length === 0) {
          delete newWeapons[database];
        }
        newValues = {
          ...state.values,
          weapons: newWeapons,
        };
      }
      // Update values and deprecated aliases together
      return { values: newValues, workingValues: newValues, savedValues: newValues };
    });

    // Fire-and-forget API write with updated entries (excluding removed key)
    const state = get();
    const entries = isCharacter
      ? state.values.character[category] || {}
      : state.values.weapons[database]?.[category] || {};

    saveToApi(database, category, entries).then((success) => {
      if (!success) {
        toast.error(`Failed to save ${database}/${category}`);
      }
    });
  },

  setBulkWeaponValue: (category, key, value, weaponNames) => {
    // Optimistic update - update local state immediately
    set((state) => {
      const newWeapons = { ...state.values.weapons };

      for (const weaponName of weaponNames) {
        newWeapons[weaponName] = {
          ...newWeapons[weaponName],
          [category]: {
            ...newWeapons[weaponName]?.[category],
            [key]: value,
          },
        };
      }

      const newValues = {
        ...state.values,
        weapons: newWeapons,
      };
      // Update values and deprecated aliases together
      return { values: newValues, workingValues: newValues, savedValues: newValues };
    });

    // Fire-and-forget API writes for each weapon
    const state = get();
    for (const weaponName of weaponNames) {
      const entries = state.values.weapons[weaponName]?.[category] || {};
      saveToApi(weaponName, category, entries).then((success) => {
        if (!success) {
          toast.error(`Failed to save ${weaponName}/${category}`);
        }
      });
    }
  },

  getValue: (database, category, key) => {
    const state = get();
    const isCharacter = database === 'Character';

    if (isCharacter) {
      return state.values.character[category]?.[key];
    } else {
      return state.values.weapons[database]?.[category]?.[key];
    }
  },

  markCategoryLoaded: (path) =>
    set((state) => ({
      loadedCategories: new Set([...state.loadedCategories, path]),
    })),

  isCategoryLoaded: (path) => {
    return get().loadedCategories.has(path);
  },

  clearCategory: (database, category) =>
    set((state) => {
      const isCharacter = database === 'Character';
      let newValues: ConfigState['values'];

      if (isCharacter) {
        const { [category]: _, ...remainingCategories } = state.values.character;
        newValues = {
          ...state.values,
          character: remainingCategories,
        };
      } else {
        const weaponCategories = state.values.weapons[database] || {};
        const { [category]: _, ...remainingCategories } = weaponCategories;
        newValues = {
          ...state.values,
          weapons: {
            ...state.values.weapons,
            [database]: remainingCategories,
          },
        };
      }

      return {
        values: newValues,
        workingValues: newValues,
        savedValues: newValues,
        loadedCategories: new Set(
          [...state.loadedCategories].filter((p) => p !== `${database}/${category}`)
        ),
      };
    }),

  loadPreset: (presetData) =>
    set(() => {
      // In the new model, loadPreset directly replaces values with preset data
      // Tombstones for keys not in preset are handled by the API when saving
      const newValues: ConfigState['values'] = {
        character: {},
        weapons: {},
      };

      // Copy preset character values
      for (const [category, entries] of Object.entries(presetData.character)) {
        newValues.character[category] = { ...entries };
      }

      // Copy preset weapon values
      for (const [weapon, categories] of Object.entries(presetData.weapons)) {
        newValues.weapons[weapon] = {};
        for (const [category, entries] of Object.entries(categories)) {
          newValues.weapons[weapon][category] = { ...entries };
        }
      }

      // Update values and deprecated aliases together
      return { values: newValues, workingValues: newValues, savedValues: newValues };
    }),

  // Deprecated aliases - these are kept for backward compatibility with UI components
  // They will be removed in Phase 25 when UI is updated

  // setWorkingValue and setSavedValue now both point to setValue
  setWorkingValue: (database, category, key, value) => {
    get().setValue(database, category, key, value);
  },

  setSavedValue: (database, category, key, value) => {
    get().setValue(database, category, key, value);
  },

  // getEffectiveValue now just returns from values (no working/saved distinction)
  getEffectiveValue: (database, category, key) => {
    return get().getValue(database, category, key);
  },

  // resetWorkingValues is a no-op (no working state to reset)
  resetWorkingValues: () => {
    // No-op in new model
  },

  // commitWorkingToSaved is a no-op (no working/saved distinction)
  commitWorkingToSaved: () => {
    // No-op in new model
  },

  // removeWorkingValue now delegates to removeValue
  removeWorkingValue: (database, category, key) => {
    get().removeValue(database, category, key);
  },

  // clearSavedCategory now delegates to clearCategory
  clearSavedCategory: (database, category) => {
    get().clearCategory(database, category);
  },
}));
