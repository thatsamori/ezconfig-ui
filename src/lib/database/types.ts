/**
 * Database layer types for JSON file storage
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
 * Config data stored in a category file - a single object with all key-value pairs
 * Example: { "CanDodge": true, "Windup": 0.675 }
 */
export type ConfigData = Record<string, ConfigValue>;

/**
 * Parsed database path from URL segments
 */
export type DatabasePath = {
  database: string;
  category: string;
};
