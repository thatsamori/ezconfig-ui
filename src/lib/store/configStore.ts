import { create } from 'zustand';

export interface ConfigState {
  // Character config: configKey -> current value
  characterValues: Record<string, any>;
  // Character staged: configKey -> boolean (is this option staged for apply?)
  characterStaged: Record<string, boolean>;

  // Weapon configs: weaponName -> configKey -> current value
  weaponValues: Record<string, Record<string, any>>;
  // Weapon staged: weaponName -> configKey -> boolean
  weaponStaged: Record<string, Record<string, boolean>>;

  // Currently selected weapons for multi-edit
  selectedWeapons: string[];

  // Actions
  setCharacterValue: (key: string, value: any) => void;
  setCharacterStaged: (key: string, staged: boolean) => void;
  setWeaponValue: (weapon: string, key: string, value: any) => void;
  setWeaponStaged: (weapon: string, key: string, staged: boolean) => void;
  setSelectedWeapons: (weapons: string[]) => void;

  // Bulk operations
  initializeFromGameIni: (
    characterValues: Record<string, any>,
    weaponValues: Record<string, Record<string, any>>
  ) => void;
  getStagedChanges: () => {
    character: Record<string, any>;
    weapons: Record<string, Record<string, any>>;
  };
  resetToDefaults: () => void;
}

const initialState = {
  characterValues: {},
  characterStaged: {},
  weaponValues: {},
  weaponStaged: {},
  selectedWeapons: [],
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  ...initialState,

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

  setSelectedWeapons: (weapons) =>
    set({ selectedWeapons: weapons }),

  initializeFromGameIni: (characterValues, weaponValues) => {
    // Initialize values from parsed Game.ini
    // Mark all loaded values as staged (checked)
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

    set({
      characterValues,
      characterStaged,
      weaponValues,
      weaponStaged,
    });
  },

  getStagedChanges: () => {
    const state = get();

    // Collect only staged character values
    const character: Record<string, any> = {};
    for (const [key, staged] of Object.entries(state.characterStaged)) {
      if (staged && key in state.characterValues) {
        character[key] = state.characterValues[key];
      }
    }

    // Collect only staged weapon values
    const weapons: Record<string, Record<string, any>> = {};
    for (const [weapon, stagedKeys] of Object.entries(state.weaponStaged)) {
      for (const [key, staged] of Object.entries(stagedKeys)) {
        if (staged && state.weaponValues[weapon]?.[key] !== undefined) {
          if (!weapons[weapon]) {
            weapons[weapon] = {};
          }
          weapons[weapon][key] = state.weaponValues[weapon][key];
        }
      }
    }

    return { character, weapons };
  },

  resetToDefaults: () => set(initialState),
}));
