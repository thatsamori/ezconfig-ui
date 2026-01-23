# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- camelCase for TypeScript modules: `characterConfigSchema.ts`, `rconExamples.ts`
- *Schema.ts suffix for configuration definitions
- No test file conventions detected

**Functions:**
- camelCase for all functions: `validateAndConvertDataType`, `sendWeaponConfigUpdate`
- Descriptive action names: validate*, send*, get*

**Variables:**
- camelCase for variables: `configKey`, `configValue`, `formattedValue`
- UPPER_SNAKE_CASE for constants: `CHARACTER_CONFIG_OPTIONS`, `WEAPON_CONFIG_OPTIONS`

**Types:**
- PascalCase for types: `ConfigEntry`, `CharacterConfigKeyType`
- PascalCase for enums: `DataType`, `WeaponName`, `CharacterConfigGroupName`
- PascalCase for enum values: `DataType.Boolean`, `DataType.Float`

## Code Style

**Formatting:**
- No Prettier config detected
- 2 space indentation (inferred from tsconfig.json)
- Double quotes for JSX (React JSX enabled in tsconfig)
- Semicolons omitted (inferred from existing code)

**Linting:**
- No ESLint config detected
- TypeScript strict mode enabled

## Import Organization

**Order:**
1. Type imports with `import type { ... }`
2. Named imports from local modules
3. Named imports from external packages

**Grouping:**
- Type imports separated from value imports
- Example from `rconExamples.ts`:
  ```typescript
  import type { CharacterConfigGroupName, CharacterConfigKeyType } from "./characterConfigSchema"
  import { DataType, type ConfigEntry } from "./types"
  import { Rcon } from "rcon-client"
  ```

**Path Aliases:**
- No path aliases configured
- Relative imports used: `./types`, `./characterConfigSchema`

## Error Handling

**Patterns:**
- Throw errors on validation failure
- Descriptive error messages include the config key
- No try/catch at module boundaries

**Error Types:**
- Standard Error class used
- No custom error classes

## Logging

**Framework:**
- console.log for output
- No structured logging

**Patterns:**
- Log RCON command responses: `console.log("RCON command success: ", response)`

## Comments

**When to Comment:**
- TODO comments for future work: `// These should be moved to env vars`
- JSDoc block comments for type documentation
- Inline comments for section headers (Booleans, Floats, Vectors)

**JSDoc/TSDoc:**
- Not extensively used
- Example type documentation in `types.ts`

**TODO Comments:**
- Format: `// These should be moved to env vars`
- No issue linking

## Function Design

**Size:**
- Functions are compact (10-30 lines)
- Single responsibility principle observed

**Parameters:**
- 3-4 parameters typical
- Types specified via TypeScript

**Return Values:**
- Explicit returns
- Async functions return Promises
- Validation returns formatted string or throws

## Module Design

**Exports:**
- Named exports preferred: `export type`, `export enum`, `export const`
- No default exports detected

**Barrel Files:**
- No index.ts barrel files
- Direct imports to specific files

---

*Convention analysis: 2026-01-23*
*Update when patterns change*
