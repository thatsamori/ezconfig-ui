# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- camelCase for source files: `characterConfigSchema.ts`, `weaponConfigSchema.ts`, `rconExamples.ts`
- Single lowercase word for utility files: `types.ts`
- No test files present (future: `*.test.ts` pattern expected based on .gitignore)

**Functions:**
- camelCase for all functions: `validateAndConvertDataType`, `sendWeaponConfigUpdate`, `sendCharacterConfigUpdate`
- No special prefix for async functions
- Descriptive verb + noun pattern: `sendConfigUpdate`, `validateDataType`

**Variables:**
- camelCase for variables: `characterConfigFlatMap`, `weaponConfigFlatMap`, `configEntry`
- UPPER_SNAKE_CASE for constants: `CHARACTER_CONFIG_OPTIONS`, `WEAPON_CONFIG_OPTIONS`
- No underscore prefix for private members

**Types:**
- PascalCase for interfaces: `ConfigEntry`
- PascalCase for type aliases: `CharacterConfigKeyType`, `WeaponConfigKeyType`
- PascalCase for enums: `DataType`, `CharacterConfigGroupName`, `WeaponName`
- Enum values match key name: `Movement = "Movement"`, `Boolean = "Boolean"`

## Code Style

**Formatting:**
- 2-space indentation (consistent across all files)
- Double quotes for strings
- Semicolons always used
- No max line length enforced (lines up to ~80 characters observed)

**Linting:**
- No ESLint configuration present
- No Prettier configuration present
- Formatting appears manual but consistent

## Import Organization

**Order:**
1. External packages: `import { Rcon } from "rcon-client";`
2. Internal modules: `import { DataType } from "./types";`

**Grouping:**
- No blank lines between import groups
- Related imports from same module combined: `import { ..., type ... } from "./schema";`

**Path Aliases:**
- None configured (relative paths only: `./types`, `./characterConfigSchema`)

## Error Handling

**Patterns:**
- Throw errors with descriptive messages including context
- Error messages include config key: `Invalid value for boolean config key: ${configKey}`
- No try/catch at function boundaries (identified as gap)

**Error Types:**
- Standard `Error` class only
- No custom error classes

**Validation:**
- Type checking at runtime: `typeof configValue !== "boolean"`
- Array validation: `!Array.isArray(configValue)`, `configValue.length !== 3`

## Logging

**Framework:**
- Console.log for output
- No structured logging

**Patterns:**
- Success logging only: `console.log("RCON command success: ", response);`
- No error logging present
- No log levels

## Comments

**When to Comment:**
- Section headers for data type groups: `// Booleans`, `// Floats`, `// Vector 2D`
- TODO comments for pending work: `// These should be moved to env vars`

**JSDoc/TSDoc:**
- Block comment example for type structure in `types.ts`
- Not required for all functions

**TODO Comments:**
- Format: `// These should be moved to env vars`
- No ticket/issue references

## Function Design

**Size:**
- Functions under 30 lines
- `validateAndConvertDataType()` is the longest at ~53 lines (multiple type cases)

**Parameters:**
- Up to 4 parameters acceptable: `sendWeaponConfigUpdate(weaponName, groupName, configKey, configValue)`
- Type annotations for all parameters
- `any` type used for config values (noted as area for improvement)

**Return Values:**
- Explicit returns
- Validation function returns formatted string or implicitly undefined (bug potential)

## Module Design

**Exports:**
- Named exports for everything: `export enum`, `export const`, `export type`
- No default exports
- Type exports with `type` keyword: `type CharacterConfigKeyType`

**Barrel Files:**
- None used (direct imports from each file)

## Schema Object Pattern

**Structure:**
```typescript
export const CONFIG_OPTIONS = {
  GroupName: [
    {
      configKey: "KeyName",
      dataType: DataType.Type,
      isImplemented: false,
      documentation: "",
      default: value,
    },
    // ...
  ],
};
```

**Flat Map Pattern:**
```typescript
export const configFlatMap = Object.values(CONFIG_OPTIONS)
  .reduce((acc, group) => [...acc, ...group], [])
  .reduce(
    (acc, configEntry) => ({
      ...acc,
      [configEntry.configKey]: configEntry,
    }),
    {},
  );
```

---

*Convention analysis: 2026-01-23*
*Update when patterns change*
