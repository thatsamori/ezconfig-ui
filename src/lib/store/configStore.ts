import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Config values can be various types from the schema
export type ConfigValue = boolean | number | number[] | { x: number; y: number } | { x: number; y: number; z: number };

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
  getEffectiveValue: (database: string, category: string, key: string) => ConfigValue | undefined;
  markCategoryLoaded: (path: string) => void;
  isCategoryLoaded: (path: string) => boolean;
  resetWorkingValues: () => void;
  clearSavedCategory: (database: string, category: string) => void;
  removeWorkingValue: (database: string, category: string, key: string) => void;

  // ============================================================
  // DEPRECATED: v0.1 compatibility layer - will be removed in Phase 7
  // These exist only to allow old components to compile during transition
  // ============================================================
  /** @deprecated Use workingValues instead */
  characterValues: Record<string, ConfigValue>;
  /** @deprecated Will be removed - staging no longer used */
  characterStaged: Record<string, boolean>;
  /** @deprecated Use workingValues instead */
  weaponValues: Record<string, Record<string, ConfigValue>>;
  /** @deprecated Will be removed - staging no longer used */
  weaponStaged: Record<string, Record<string, boolean>>;
  /** @deprecated Will be removed - bulk selection no longer used */
  selectedWeapons: string[];
  /** @deprecated Use setWorkingValue instead */
  setCharacterValue: (key: string, value: ConfigValue) => void;
  /** @deprecated Will be removed - staging no longer used */
  setCharacterStaged: (key: string, staged: boolean) => void;
  /** @deprecated Use setWorkingValue instead */
  setWeaponValue: (weapon: string, key: string, value: ConfigValue) => void;
  /** @deprecated Will be removed - staging no longer used */
  setWeaponStaged: (weapon: string, key: string, staged: boolean) => void;
  /** @deprecated Will be removed - bulk selection no longer used */
  setSelectedWeapons: (weapons: string[]) => void;
  /** @deprecated Will be removed - no longer using Game.ini as source */
  initializeFromGameIni: (characterValues: Record<string, ConfigValue>, weaponValues: Record<string, Record<string, ConfigValue>>) => void;
  /** @deprecated Will be removed - staging no longer used */
  getStagedChanges: () => { character: Record<string, ConfigValue>; weapons: Record<string, Record<string, ConfigValue>> };
  /** @deprecated Use resetWorkingValues instead */
  resetToDefaults: () => void;
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
      if (!deepEqual(workingVal, savedVal)) {
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
        if (!deepEqual(workingVal, savedVal)) {
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
  // Deprecated v0.1 state
  characterValues: {} as Record<string, ConfigValue>,
  characterStaged: {} as Record<string, boolean>,
  weaponValues: {} as Record<string, Record<string, ConfigValue>>,
  weaponStaged: {} as Record<string, Record<string, boolean>>,
  selectedWeapons: [] as string[],
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

      getEffectiveValue: (database, category, key) => {
        const state = get();
        const isCharacter = database === 'Character';

        if (isCharacter) {
          const workingVal = state.workingValues.character[category]?.[key];
          if (workingVal !== undefined) return workingVal;
          return state.savedValues.character[category]?.[key];
        } else {
          const workingVal = state.workingValues.weapons[database]?.[category]?.[key];
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

      // ============================================================
      // DEPRECATED: v0.1 compatibility methods - will be removed in Phase 7
      // ============================================================
      setCharacterValue: (key, value) =>
        set((state) => ({
          characterValues: { ...state.characterValues, [key]: value },
        })),

      setCharacterStaged: (key, staged) =>
        set((state) => ({
          characterStaged: { ...state.characterStaged, [key]: staged },
        })),

      setWeaponValue: (weapon, key, value) =>
        set((state) => ({
          weaponValues: {
            ...state.weaponValues,
            [weapon]: { ...state.weaponValues[weapon], [key]: value },
          },
        })),

      setWeaponStaged: (weapon, key, staged) =>
        set((state) => ({
          weaponStaged: {
            ...state.weaponStaged,
            [weapon]: { ...state.weaponStaged[weapon], [key]: staged },
          },
        })),

      setSelectedWeapons: (weapons) => set({ selectedWeapons: weapons }),

      initializeFromGameIni: (characterValues, weaponValues) => {
        const characterStaged: Record<string, boolean> = {};
        for (const key of Object.keys(characterValues)) {
          characterStaged[key] = true;
        }
        const weaponStaged: Record<string, Record<string, boolean>> = {};
        for (const [weapon, configs] of Object.entries(weaponValues)) {
          weaponStaged[weapon] = {};
          for (const key of Object.keys(configs)) {
            weaponStaged[weapon][key] = true;
          }
        }
        set({ characterValues, characterStaged, weaponValues, weaponStaged });
      },

      getStagedChanges: () => {
        const state = get();
        const character: Record<string, ConfigValue> = {};
        for (const [key, staged] of Object.entries(state.characterStaged)) {
          if (staged && key in state.characterValues) {
            character[key] = state.characterValues[key];
          }
        }
        const weapons: Record<string, Record<string, ConfigValue>> = {};
        for (const [weapon, stagedKeys] of Object.entries(state.weaponStaged)) {
          for (const [key, staged] of Object.entries(stagedKeys)) {
            if (staged && state.weaponValues[weapon]?.[key] !== undefined) {
              if (!weapons[weapon]) weapons[weapon] = {};
              weapons[weapon][key] = state.weaponValues[weapon][key];
            }
          }
        }
        return { character, weapons };
      },

      resetToDefaults: () =>
        set({
          ...initialState,
          loadedCategories: new Set<string>(),
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
