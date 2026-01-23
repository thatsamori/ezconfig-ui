# Architecture

**Analysis Date:** 2026-01-23

## Pattern Overview

**Overall:** Schema-driven Configuration Library

**Key Characteristics:**
- Configuration schemas define available game settings
- Type-safe config entries with validation
- RCON protocol for game server communication
- No UI yet (library/module stage)

## Layers

**Schema Layer:**
- Purpose: Define available configuration options with types and defaults
- Contains: Config entry definitions, enums for categories
- Location: `characterConfigSchema.ts`, `weaponConfigSchema.ts`, `types.ts`
- Depends on: Nothing (pure data definitions)
- Used by: RCON layer

**RCON Layer:**
- Purpose: Send configuration updates to game server
- Contains: Connection setup, value formatting, command sending
- Location: `rconExamples.ts`
- Depends on: Schema layer, rcon-client package
- Used by: Future UI layer

**Types Layer:**
- Purpose: Shared type definitions
- Contains: ConfigEntry type, DataType enum
- Location: `types.ts`
- Depends on: Nothing
- Used by: Schema layer, RCON layer

## Data Flow

**Configuration Update:**

1. Schema defines config key, data type, and default value
2. User provides config key and new value
3. `validateAndConvertDataType()` validates value matches expected type
4. Value formatted to string for RCON protocol
5. RCON command sent to game server
6. Server applies configuration change

**State Management:**
- Stateless - each update is independent
- No persistent state (yet)
- RCON connection maintained for duration of session

## Key Abstractions

**ConfigEntry:**
- Purpose: Single configuration option definition
- Examples: `{ configKey: "CanDodge", dataType: DataType.Boolean, default: false }`
- Pattern: Plain object with typed fields

**DataType Enum:**
- Purpose: Define supported value types
- Examples: Boolean, Float, Vector, Vector2D, FloatArray
- Pattern: TypeScript string enum

**Config Flat Maps:**
- Purpose: Quick lookup of config entries by key
- Examples: `characterConfigFlatMap`, `weaponConfigFlatMap`
- Pattern: Derived lookup object from grouped arrays

## Entry Points

**RCON Examples:**
- Location: `rconExamples.ts`
- Triggers: Direct execution (`bun run rconExamples.ts`)
- Responsibilities: Connect to server, send config updates

**No Main Entry:**
- Project is currently library/schema stage
- No index.ts or main entry point

## Error Handling

**Strategy:** Throw errors on validation failure

**Patterns:**
- Type validation in `validateAndConvertDataType()`
- Throw Error with descriptive message on type mismatch
- No try/catch at top level (errors bubble to caller)

## Cross-Cutting Concerns

**Logging:**
- console.log for RCON response output
- No structured logging

**Validation:**
- Runtime type checking in `validateAndConvertDataType()`
- TypeScript static typing for schemas

**Authentication:**
- RCON password in connection config
- Currently hardcoded (needs env vars)

---

*Architecture analysis: 2026-01-23*
*Update when major patterns change*
