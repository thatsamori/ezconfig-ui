import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PresetData } from '@/lib/presets/types';

// Config values can be various types from the schema
// null is used as a tombstone to mark saved values for deletion (reset to game default)
export type ConfigValue = boolean | number | number[] | { x: number; y: number } | { x: number; y: number; z: number } | null;

export interface ConfigState {
  // Saved values (from API, source of truth for UI reset)
  savedValues: {
    character: Record<string, Record<string, ConfigValue>>; // category -> key -> value
    weapons: Record<string, Record<string, Record<string, ConfigValue>>>; // weapon -> category -> key -> value
  };

  // Working values (user edits, not yet saved)
  workingValues: {
    character: Record<string, Record<string, ConfigValue>>;
    weapons: Record<string, Record<string, Record<string, ConfigValue>>>;
  };

  // Loading state per database/category
  loadedCategories: Set<string>; // "Character/Movement", "Greatsword/General"

  // Dirty tracking
  hasUnsavedChanges: boolean;

  // Actions
  setSavedValue: (database: string, category: string, key: string, value: ConfigValue) => void;
  setWorkingValue: (database: string, category: string, key: string, value: ConfigValue) => void;
  setBulkWeaponValue: (category: string, key: string, value: ConfigValue, weaponNames: string[]) => void;
  getEffectiveValue: (database: string, category: string, key: string) => ConfigValue | undefined;
  markCategoryLoaded: (path: string) => void;
  isCategoryLoaded: (path: string) => boolean;
  resetWorkingValues: () => void;
  commitWorkingToSaved: () => void;
  clearSavedCategory: (database: string, category: string) => void;
  removeWorkingValue: (database: string, category: string, key: string) => void;
  loadPreset: (presetData: PresetData) => void;
}

// Deep equality check for comparing working vs saved values
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!bKeys.includes(key)) return false;
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  return false;
}

// Calculate if there are unsaved changes by comparing working to saved
function calculateHasUnsavedChanges(
  workingValues: ConfigState['workingValues'],
  savedValues: ConfigState['savedValues']
): boolean {
  // Check character categories
  for (const category of Object.keys(workingValues.character)) {
    for (const key of Object.keys(workingValues.character[category])) {
      const workingVal = workingValues.character[category][key];
      const savedVal = savedValues.character[category]?.[key];
      // null tombstone means "delete" - it's a change if saved value exists
      if (workingVal === null) {
        if (savedVal !== undefined) return true;
      } else if (!deepEqual(workingVal, savedVal)) {
        return true;
      }
    }
  }

  // Check weapon categories
  for (const weapon of Object.keys(workingValues.weapons)) {
    for (const category of Object.keys(workingValues.weapons[weapon])) {
      for (const key of Object.keys(workingValues.weapons[weapon][category])) {
        const workingVal = workingValues.weapons[weapon][category][key];
        const savedVal = savedValues.weapons[weapon]?.[category]?.[key];
        // null tombstone means "delete" - it's a change if saved value exists
        if (workingVal === null) {
          if (savedVal !== undefined) return true;
        } else if (!deepEqual(workingVal, savedVal)) {
          return true;
        }
      }
    }
  }

  return false;
}

const initialState = {
  savedValues: {
    character: {},
    weapons: {},
  },
  workingValues: {
    character: {},
    weapons: {},
  },
  loadedCategories: new Set<string>(),
  hasUnsavedChanges: false,
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setSavedValue: (database, category, key, value) =>
        set((state) => {
          // Determine if this is a character or weapon database
          const isCharacter = database === 'Character';

          if (isCharacter) {
            const newSavedValues = {
              ...state.savedValues,
              character: {
                ...state.savedValues.character,
                [category]: {
                  ...state.savedValues.character[category],
                  [key]: value,
                },
              },
            };
            return {
              savedValues: newSavedValues,
              hasUnsavedChanges: calculateHasUnsavedChanges(state.workingValues, newSavedValues),
            };
          } else {
            // Weapon database (database is the weapon name)
            const newSavedValues = {
              ...state.savedValues,
              weapons: {
                ...state.savedValues.weapons,
                [database]: {
                  ...state.savedValues.weapons[database],
                  [category]: {
                    ...state.savedValues.weapons[database]?.[category],
                    [key]: value,
                  },
                },
              },
            };
            return {
              savedValues: newSavedValues,
              hasUnsavedChanges: calculateHasUnsavedChanges(state.workingValues, newSavedValues),
            };
          }
        }),

      setWorkingValue: (database, category, key, value) =>
        set((state) => {
          const isCharacter = database === 'Character';

          if (isCharacter) {
            const newWorkingValues = {
              ...state.workingValues,
              character: {
                ...state.workingValues.character,
                [category]: {
                  ...state.workingValues.character[category],
                  [key]: value,
                },
              },
            };
            return {
              workingValues: newWorkingValues,
              hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
            };
          } else {
            const newWorkingValues = {
              ...state.workingValues,
              weapons: {
                ...state.workingValues.weapons,
                [database]: {
                  ...state.workingValues.weapons[database],
                  [category]: {
                    ...state.workingValues.weapons[database]?.[category],
                    [key]: value,
                  },
                },
              },
            };
            return {
              workingValues: newWorkingValues,
              hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
            };
          }
        }),

      setBulkWeaponValue: (category, key, value, weaponNames) =>
        set((state) => {
          // Batch update all weapons in a single state update for performance
          const newWeapons = { ...state.workingValues.weapons };

          for (const weaponName of weaponNames) {
            newWeapons[weaponName] = {
              ...newWeapons[weaponName],
              [category]: {
                ...newWeapons[weaponName]?.[category],
                [key]: value,
              },
            };
          }

          const newWorkingValues = {
            ...state.workingValues,
            weapons: newWeapons,
          };

          return {
            workingValues: newWorkingValues,
            hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
          };
        }),

      getEffectiveValue: (database, category, key) => {
        const state = get();
        const isCharacter = database === 'Character';

        if (isCharacter) {
          const workingVal = state.workingValues.character[category]?.[key];
          // null is a tombstone meaning "reset to game default"
          if (workingVal === null) return undefined;
          if (workingVal !== undefined) return workingVal;
          return state.savedValues.character[category]?.[key];
        } else {
          const workingVal = state.workingValues.weapons[database]?.[category]?.[key];
          // null is a tombstone meaning "reset to game default"
          if (workingVal === null) return undefined;
          if (workingVal !== undefined) return workingVal;
          return state.savedValues.weapons[database]?.[category]?.[key];
        }
      },

      markCategoryLoaded: (path) =>
        set((state) => ({
          loadedCategories: new Set([...state.loadedCategories, path]),
        })),

      isCategoryLoaded: (path) => {
        return get().loadedCategories.has(path);
      },

      resetWorkingValues: () =>
        set((state) => ({
          workingValues: {
            character: {},
            weapons: {},
          },
          hasUnsavedChanges: false,
        })),

      commitWorkingToSaved: () =>
        set((state) => {
          // Deep merge working values into saved values
          // null values (tombstones) mean "delete from saved"
          const newSavedValues = {
            character: { ...state.savedValues.character },
            weapons: { ...state.savedValues.weapons },
          };

          // Merge character working values
          for (const [category, entries] of Object.entries(state.workingValues.character)) {
            if (!newSavedValues.character[category]) {
              newSavedValues.character[category] = {};
            } else {
              newSavedValues.character[category] = { ...newSavedValues.character[category] };
            }
            for (const [key, value] of Object.entries(entries)) {
              if (value === null) {
                // Tombstone: delete from saved
                delete newSavedValues.character[category][key];
              } else {
                newSavedValues.character[category][key] = value;
              }
            }
            // Clean up empty categories
            if (Object.keys(newSavedValues.character[category]).length === 0) {
              delete newSavedValues.character[category];
            }
          }

          // Merge weapon working values
          for (const [weapon, categories] of Object.entries(state.workingValues.weapons)) {
            if (!newSavedValues.weapons[weapon]) {
              newSavedValues.weapons[weapon] = {};
            }
            for (const [category, entries] of Object.entries(categories)) {
              if (!newSavedValues.weapons[weapon][category]) {
                newSavedValues.weapons[weapon][category] = {};
              } else {
                newSavedValues.weapons[weapon][category] = { ...newSavedValues.weapons[weapon][category] };
              }
              for (const [key, value] of Object.entries(entries)) {
                if (value === null) {
                  // Tombstone: delete from saved
                  delete newSavedValues.weapons[weapon][category][key];
                } else {
                  newSavedValues.weapons[weapon][category][key] = value;
                }
              }
              // Clean up empty categories
              if (Object.keys(newSavedValues.weapons[weapon][category]).length === 0) {
                delete newSavedValues.weapons[weapon][category];
              }
            }
            // Clean up empty weapons
            if (Object.keys(newSavedValues.weapons[weapon]).length === 0) {
              delete newSavedValues.weapons[weapon];
            }
          }

          return {
            savedValues: newSavedValues,
            workingValues: {
              character: {},
              weapons: {},
            },
            hasUnsavedChanges: false,
          };
        }),

      clearSavedCategory: (database, category) =>
        set((state) => {
          const isCharacter = database === 'Character';

          if (isCharacter) {
            const { [category]: _, ...remainingCategories } = state.savedValues.character;
            const newSavedValues = {
              ...state.savedValues,
              character: remainingCategories,
            };
            return {
              savedValues: newSavedValues,
              loadedCategories: new Set(
                [...state.loadedCategories].filter((p) => p !== `${database}/${category}`)
              ),
              hasUnsavedChanges: calculateHasUnsavedChanges(state.workingValues, newSavedValues),
            };
          } else {
            const weaponCategories = state.savedValues.weapons[database] || {};
            const { [category]: _, ...remainingCategories } = weaponCategories;
            const newSavedValues = {
              ...state.savedValues,
              weapons: {
                ...state.savedValues.weapons,
                [database]: remainingCategories,
              },
            };
            return {
              savedValues: newSavedValues,
              loadedCategories: new Set(
                [...state.loadedCategories].filter((p) => p !== `${database}/${category}`)
              ),
              hasUnsavedChanges: calculateHasUnsavedChanges(state.workingValues, newSavedValues),
            };
          }
        }),

      removeWorkingValue: (database, category, key) =>
        set((state) => {
          const isCharacter = database === 'Character';

          if (isCharacter) {
            const savedVal = state.savedValues.character[category]?.[key];

            // If there's a saved value, set tombstone (null) to mark for deletion
            if (savedVal !== undefined) {
              const newWorkingValues = {
                ...state.workingValues,
                character: {
                  ...state.workingValues.character,
                  [category]: {
                    ...state.workingValues.character[category],
                    [key]: null,
                  },
                },
              };
              return {
                workingValues: newWorkingValues,
                hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
              };
            }

            // No saved value, just remove the working value
            const categoryValues = state.workingValues.character[category] || {};
            const { [key]: _, ...remainingKeys } = categoryValues;
            const newWorkingValues = {
              ...state.workingValues,
              character: {
                ...state.workingValues.character,
                [category]: remainingKeys,
              },
            };
            // Clean up empty category objects
            if (Object.keys(remainingKeys).length === 0) {
              const { [category]: __, ...remainingCategories } = newWorkingValues.character;
              newWorkingValues.character = remainingCategories;
            }
            return {
              workingValues: newWorkingValues,
              hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
            };
          } else {
            const savedVal = state.savedValues.weapons[database]?.[category]?.[key];

            // If there's a saved value, set tombstone (null) to mark for deletion
            if (savedVal !== undefined) {
              const newWorkingValues = {
                ...state.workingValues,
                weapons: {
                  ...state.workingValues.weapons,
                  [database]: {
                    ...state.workingValues.weapons[database],
                    [category]: {
                      ...state.workingValues.weapons[database]?.[category],
                      [key]: null,
                    },
                  },
                },
              };
              return {
                workingValues: newWorkingValues,
                hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
              };
            }

            // No saved value, just remove the working value
            const weaponCategories = state.workingValues.weapons[database] || {};
            const categoryValues = weaponCategories[category] || {};
            const { [key]: _, ...remainingKeys } = categoryValues;
            const newWorkingValues = {
              ...state.workingValues,
              weapons: {
                ...state.workingValues.weapons,
                [database]: {
                  ...weaponCategories,
                  [category]: remainingKeys,
                },
              },
            };
            // Clean up empty category objects
            if (Object.keys(remainingKeys).length === 0) {
              const { [category]: __, ...remainingCategories } = newWorkingValues.weapons[database];
              newWorkingValues.weapons[database] = remainingCategories;
            }
            // Clean up empty weapon objects
            if (Object.keys(newWorkingValues.weapons[database]).length === 0) {
              const { [database]: ___, ...remainingWeapons } = newWorkingValues.weapons;
              newWorkingValues.weapons = remainingWeapons;
            }
            return {
              workingValues: newWorkingValues,
              hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
            };
          }
        }),

      loadPreset: (presetData) =>
        set((state) => {
          // Build workingValues that represents the delta from saved to preset
          // For keys in saved but not in preset: add null tombstone (delete)
          // For keys in preset: add the preset value (even if same as saved, to ensure consistency)
          const newWorkingValues: ConfigState['workingValues'] = {
            character: {},
            weapons: {},
          };

          // Process character categories
          // Collect all categories from BOTH saved and working values
          const allCharacterCategories = new Set([
            ...Object.keys(state.savedValues.character),
            ...Object.keys(state.workingValues.character),
          ]);

          // For each category, tombstone keys not in preset
          for (const category of allCharacterCategories) {
            const savedEntries = state.savedValues.character[category] || {};
            const workingEntries = state.workingValues.character[category] || {};
            const presetCategory = presetData.character[category] || {};

            // Collect all keys from both saved and working
            const allKeys = new Set([
              ...Object.keys(savedEntries),
              ...Object.keys(workingEntries),
            ]);

            for (const key of allKeys) {
              if (!(key in presetCategory)) {
                // Key exists in saved or working but not in preset - tombstone it
                if (!newWorkingValues.character[category]) {
                  newWorkingValues.character[category] = {};
                }
                newWorkingValues.character[category][key] = null;
              }
            }
          }
          // Then, add preset values (will override saved when displayed/saved)
          for (const [category, presetEntries] of Object.entries(presetData.character)) {
            if (!newWorkingValues.character[category]) {
              newWorkingValues.character[category] = {};
            }
            for (const [key, value] of Object.entries(presetEntries)) {
              newWorkingValues.character[category][key] = value;
            }
          }

          // Process weapon categories
          // Collect all weapons from BOTH saved and working values
          const allWeapons = new Set([
            ...Object.keys(state.savedValues.weapons),
            ...Object.keys(state.workingValues.weapons),
          ]);

          for (const weapon of allWeapons) {
            const savedCategories = state.savedValues.weapons[weapon] || {};
            const workingCategories = state.workingValues.weapons[weapon] || {};

            // Collect all categories for this weapon
            const allCategories = new Set([
              ...Object.keys(savedCategories),
              ...Object.keys(workingCategories),
            ]);

            for (const category of allCategories) {
              const savedEntries = savedCategories[category] || {};
              const workingEntries = workingCategories[category] || {};
              const presetCategory = presetData.weapons[weapon]?.[category] || {};

              // Collect all keys from both
              const allKeys = new Set([
                ...Object.keys(savedEntries),
                ...Object.keys(workingEntries),
              ]);

              for (const key of allKeys) {
                if (!(key in presetCategory)) {
                  // Key exists in saved or working but not in preset - tombstone it
                  if (!newWorkingValues.weapons[weapon]) {
                    newWorkingValues.weapons[weapon] = {};
                  }
                  if (!newWorkingValues.weapons[weapon][category]) {
                    newWorkingValues.weapons[weapon][category] = {};
                  }
                  newWorkingValues.weapons[weapon][category][key] = null;
                }
              }
            }
          }
          // Then, add preset values
          for (const [weapon, presetCategories] of Object.entries(presetData.weapons)) {
            if (!newWorkingValues.weapons[weapon]) {
              newWorkingValues.weapons[weapon] = {};
            }
            for (const [category, presetEntries] of Object.entries(presetCategories)) {
              if (!newWorkingValues.weapons[weapon][category]) {
                newWorkingValues.weapons[weapon][category] = {};
              }
              for (const [key, value] of Object.entries(presetEntries)) {
                newWorkingValues.weapons[weapon][category][key] = value;
              }
            }
          }

          return {
            workingValues: newWorkingValues,
            hasUnsavedChanges: calculateHasUnsavedChanges(newWorkingValues, state.savedValues),
          };
        }),
    }),
    {
      name: 'ezconfig-working',
      // Only persist working values - saved values come from API
      partialize: (state) => ({
        workingValues: state.workingValues,
      }),
      // Merge persisted working values with initial state
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ConfigState> | undefined;
        return {
          ...currentState,
          workingValues: persisted?.workingValues || currentState.workingValues,
          hasUnsavedChanges: persisted?.workingValues
            ? calculateHasUnsavedChanges(persisted.workingValues, currentState.savedValues)
            : false,
        };
      },
    }
  )
);
