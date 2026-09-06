/**
 * Schema validation utilities for config entries
 *
 * Validates config entries against the schema to ensure:
 * - Config key exists in the schema
 * - Value type matches the expected data type
 */

import {
  DataType,
  type ConfigEntry as SchemaConfigEntry,
} from "@/lib/config/types";
import { CHARACTER_CONFIG_OPTIONS } from "@/lib/config/characterConfigSchema";
import {
  WEAPON_CONFIG_OPTIONS,
  WeaponConfigAttackName,
} from "@/lib/config/weaponConfigSchema";
import type { ConfigData, ConfigValue } from "./types";

/**
 * Schema lookup result - a flat map of config key to schema entry
 */
type SchemaMap = Record<string, SchemaConfigEntry>;

/**
 * Get the schema map for a given database and category
 *
 * @param database - The database name (e.g., "Character", "Greatsword")
 * @param category - The category name (e.g., "Movement", "Strike", "General")
 * @returns A flat map of configKey -> schema entry, or null if unknown
 */
export function getSchemaForCategory(
  database: string,
  category: string,
): SchemaMap | null {
  // Character database - category maps directly to group name
  if (database === "Character") {
    const group =
      CHARACTER_CONFIG_OPTIONS[
        category as keyof typeof CHARACTER_CONFIG_OPTIONS
      ];
    if (!group) {
      return null;
    }
    return group.reduce((acc, entry) => {
      acc[entry.configKey] = entry;
      return acc;
    }, {} as SchemaMap);
  }

  // Weapon databases - category determines which schema to use
  // "General" -> WEAPON_CONFIG_OPTIONS.General
  // "Strike", "AltStrike", "Stab", "AltStab" -> WEAPON_CONFIG_OPTIONS.Attack
  if (category === "General") {
    return WEAPON_CONFIG_OPTIONS.General.reduce((acc, entry) => {
      acc[entry.configKey] = entry;
      return acc;
    }, {} as SchemaMap);
  }

  // Attack categories
  const attackCategories: string[] = Object.values(WeaponConfigAttackName);
  if (attackCategories.includes(category)) {
    return WEAPON_CONFIG_OPTIONS.Attack.reduce((acc, entry) => {
      acc[entry.configKey] = entry;
      return acc;
    }, {} as SchemaMap);
  }

  // Unknown category
  return null;
}

/**
 * Get the expected type name for a data type
 */
function getTypeName(dataType: DataType): string {
  switch (dataType) {
    case DataType.Bool:
      return "Boolean";
    case DataType.Float:
      return "Float";
    case DataType.FloatArray:
      return "FloatArray";
    case DataType.Vector2D:
      return "Vector2D";
    case DataType.Vector:
      return "Vector";
    case DataType.String:
      return "String";
    default:
      return "Unknown";
  }
}

/**
 * Get the actual type name for a value
 */
function getActualTypeName(value: ConfigValue): string {
  if (typeof value === "boolean") {
    return "Boolean";
  }
  if (typeof value === "number") {
    return "Float";
  }
  if (typeof value === "string") {
    return "String";
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "number")) {
      return "FloatArray";
    }
    return "Array";
  }
  if (typeof value === "object" && value !== null) {
    if ("x" in value && "y" in value) {
      if ("z" in value) {
        return "Vector";
      }
      return "Vector2D";
    }
    return "Object";
  }
  return typeof value;
}

/**
 * Check if a value matches the expected data type
 */
function valueMatchesType(value: ConfigValue, dataType: DataType): boolean {
  switch (dataType) {
    case DataType.Bool:
      return typeof value === "boolean";

    case DataType.Float:
      return typeof value === "number";

    case DataType.FloatArray:
      return Array.isArray(value) && value.every((v) => typeof v === "number");

    case DataType.String:
      return typeof value === "string";

    case DataType.Vector2D:
      return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        "x" in value &&
        "y" in value &&
        !("z" in value) &&
        typeof (value as { x: number; y: number }).x === "number" &&
        typeof (value as { x: number; y: number }).y === "number"
      );

    case DataType.Vector:
      return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        "x" in value &&
        "y" in value &&
        "z" in value &&
        typeof (value as { x: number; y: number; z: number }).x === "number" &&
        typeof (value as { x: number; y: number; z: number }).y === "number" &&
        typeof (value as { x: number; y: number; z: number }).z === "number"
      );

    default:
      return false;
  }
}

/**
 * Validation result for a single key-value pair
 */
export type ValidateEntryResult = {
  valid: boolean;
  error?: string;
};

/**
 * Validate a single config key-value pair against the schema
 *
 * @param key - The config key
 * @param value - The config value
 * @param schema - The schema map to validate against
 * @returns Validation result with error message if invalid
 */
export function validateConfigEntry(
  key: string,
  value: ConfigValue,
  schema: SchemaMap,
): ValidateEntryResult {
  // Key must exist in schema
  const schemaEntry = schema[key];
  if (!schemaEntry) {
    return {
      valid: false,
      error: "Unknown config key",
    };
  }

  // Value type must match schema
  if (!valueMatchesType(value, schemaEntry.dataType)) {
    const expected = getTypeName(schemaEntry.dataType);
    const actual = getActualTypeName(value);
    return {
      valid: false,
      error: `Expected ${expected}, got ${actual}`,
    };
  }

  // String entries only accept a listed choice
  if (
    schemaEntry.dataType === DataType.String &&
    schemaEntry.choices &&
    !schemaEntry.choices.includes(value as string)
  ) {
    return {
      valid: false,
      error: `Expected one of [${schemaEntry.choices.join(", ")}], got "${value}"`,
    };
  }

  return { valid: true };
}

/**
 * Validation error for a specific key
 */
export type ValidationError = {
  key: string;
  reason: string;
};

/**
 * Validation result for config data
 */
export type ValidateEntriesResult = {
  valid: boolean;
  errors: ValidationError[];
};

/**
 * Validate config data against the schema for a database/category
 *
 * @param data - Config data object to validate
 * @param database - The database name
 * @param category - The category name
 * @returns Validation result with all errors
 */
export function validateEntries(
  data: ConfigData,
  database: string,
  category: string,
): ValidateEntriesResult {
  const schema = getSchemaForCategory(database, category);

  if (!schema) {
    return {
      valid: false,
      errors: [
        {
          key: "_schema",
          reason: `Unknown database/category: ${database}/${category}`,
        },
      ],
    };
  }

  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(data)) {
    const result = validateConfigEntry(key, value, schema);
    if (!result.valid && result.error) {
      errors.push({ key, reason: result.error });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Test code - runs when executed directly with `bun run`
if (import.meta.main) {
  console.log("Running validation tests...\n");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => boolean) {
    try {
      if (fn()) {
        console.log(`  PASS: ${name}`);
        passed++;
      } else {
        console.log(`  FAIL: ${name}`);
        failed++;
      }
    } catch (error) {
      console.log(`  FAIL: ${name} - ${(error as Error).message}`);
      failed++;
    }
  }

  console.log("Test: Valid boolean entry passes");
  test("Character/Movement with CanDodge boolean", () => {
    const result = validateEntries({ CanDodge: true }, "Character", "Movement");
    return result.valid && result.errors.length === 0;
  });

  console.log("\nTest: Valid float entry passes");
  test("Character/Movement with TimeToMaxSprint float", () => {
    const result = validateEntries(
      { TimeToMaxSprint: 0.96 },
      "Character",
      "Movement",
    );
    return result.valid && result.errors.length === 0;
  });

  console.log("\nTest: Valid Vector2D entry passes (weapon)");
  test("Greatsword/General with ParryTurnCap Vector2D", () => {
    const result = validateEntries(
      { ParryTurnCap: { x: 375.0, y: 262.5 } },
      "Greatsword",
      "General",
    );
    return result.valid && result.errors.length === 0;
  });

  console.log("\nTest: Valid Vector entry passes (weapon)");
  test("Greatsword/General with ClashNormal Vector", () => {
    const result = validateEntries(
      { ClashNormal: { x: 0.0, y: -1.0, z: 0.0 } },
      "Greatsword",
      "General",
    );
    return result.valid && result.errors.length === 0;
  });

  console.log("\nTest: Valid attack category passes");
  test("Greatsword/Strike with Windup float", () => {
    const result = validateEntries({ Windup: 0.675 }, "Greatsword", "Strike");
    return result.valid && result.errors.length === 0;
  });

  console.log('\nTest: Unknown key fails with "Unknown config key"');
  test("Character/Movement with InvalidKey", () => {
    const result = validateEntries(
      { InvalidKey: true },
      "Character",
      "Movement",
    );
    return (
      !result.valid &&
      result.errors.length === 1 &&
      result.errors[0].key === "InvalidKey" &&
      result.errors[0].reason === "Unknown config key"
    );
  });

  console.log("\nTest: Type mismatch fails with expected vs actual type");
  test("Character/Movement with CanDodge as number (should be boolean)", () => {
    const result = validateEntries({ CanDodge: 123 }, "Character", "Movement");
    return (
      !result.valid &&
      result.errors.length === 1 &&
      result.errors[0].key === "CanDodge" &&
      result.errors[0].reason === "Expected Boolean, got Float"
    );
  });

  console.log("\nTest: Vector2D as Vector3D fails");
  test("Greatsword/General with ParryTurnCap as Vector (has z)", () => {
    const result = validateEntries(
      { ParryTurnCap: { x: 375.0, y: 262.5, z: 0.0 } },
      "Greatsword",
      "General",
    );
    return (
      !result.valid &&
      result.errors.length === 1 &&
      result.errors[0].reason === "Expected Vector2D, got Vector"
    );
  });

  console.log("\nTest: FloatArray validation");
  test("Greatsword/Strike with Damage as FloatArray", () => {
    const result = validateEntries(
      { Damage: [50, 45, 40] },
      "Greatsword",
      "Strike",
    );
    return result.valid && result.errors.length === 0;
  });

  console.log("\nTest: Unknown category fails");
  test("Character/Unknown category", () => {
    const result = validateEntries({ CanDodge: true }, "Character", "Unknown");
    return (
      !result.valid &&
      result.errors[0].reason.includes("Unknown database/category")
    );
  });

  console.log("\nTest: String entry accepts a listed choice only");
  const stringSchema = {
    Choice: {
      configKey: "Choice",
      dataType: DataType.String,
      isImplemented: true,
      documentation: "",
      default: "Default",
      choices: ["Default", "Other"],
    },
  };
  test("listed choice passes", () => {
    return validateConfigEntry("Choice", "Other", stringSchema).valid;
  });
  test("unlisted choice fails", () => {
    const result = validateConfigEntry("Choice", "Nope", stringSchema);
    return !result.valid && (result.error ?? "").startsWith("Expected one of");
  });
  test("non-string fails with type error", () => {
    const result = validateConfigEntry("Choice", 1, stringSchema);
    return !result.valid && result.error === "Expected String, got Float";
  });

  console.log("\nTest: Multiple entries in single object");
  test("Character/Movement with multiple keys", () => {
    const result = validateEntries(
      { CanDodge: true, TimeToMaxSprint: 0.96 },
      "Character",
      "Movement",
    );
    return result.valid && result.errors.length === 0;
  });

  console.log("\n---");
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
  console.log("\nAll tests passed!");
}
