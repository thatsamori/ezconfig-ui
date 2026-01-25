/**
 * Database layer types for JSON file storage
 */

/**
 * Possible values for a config entry
 */
export type ConfigValue =
  | boolean
  | number
  | number[]
  | { x: number; y: number }
  | { x: number; y: number; z: number };

/**
 * A single config entry - a record with exactly one key-value pair
 * Example: { "CanDodge": true } or { "Windup": 0.675 }
 */
export type ConfigEntry = Record<string, ConfigValue>;

/**
 * Parsed database path from URL segments
 */
export type DatabasePath = {
  database: string;
  category: string;
};
