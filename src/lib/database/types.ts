/**
 * Config value types, per database (Character, or a weapon class) and
 * category in the mod's terms. Platform storage is src/lib/platform/.
 */

/**
 * Possible values for a config entry
 */
export type ConfigValue =
  | boolean
  | number
  | string
  | number[]
  | { x: number; y: number }
  | { x: number; y: number; z: number };

/**
 * One category's config values, a single object with all key-value pairs
 * Example: { "CanDodge": true, "Windup": 0.675 }
 */
export type ConfigData = Record<string, ConfigValue>;
