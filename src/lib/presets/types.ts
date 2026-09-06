/**
 * Preset layer types
 */

/**
 * Possible values for a config entry (excluding null tombstone)
 */
export type ConfigValue =
  | boolean
  | number
  | string
  | number[]
  | { x: number; y: number }
  | { x: number; y: number; z: number };

/**
 * Preset manifest containing metadata about the preset
 */
export interface PresetManifest {
  title: string;
  description: string;
}

/**
 * Preset info returned when listing presets
 */
export interface PresetInfo {
  name: string;
  manifest: PresetManifest;
}

/**
 * Preset data structure matching configStore.savedValues
 */
export interface PresetData {
  character: Record<string, Record<string, ConfigValue>>; // category -> key -> value
  weapons: Record<string, Record<string, Record<string, ConfigValue>>>; // weapon -> category -> key -> value
}
