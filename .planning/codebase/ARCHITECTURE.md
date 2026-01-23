# Architecture

**Analysis Date:** 2026-01-23

## Pattern Overview

**Overall:** Schema-Driven Configuration Management Library

**Key Characteristics:**
- Declarative configuration schemas for game entities
- Type-safe validation and conversion layer
- RCON protocol integration for server communication
- Flat map pattern for O(1) config lookup

## Layers

**Data Models Layer:**
- Purpose: Central type definitions and enumerations
- Contains: `ConfigEntry` interface, `DataType` enum
- Location: `types.ts`
- Depends on: Nothing (foundation layer)
- Used by: All schema files

**Schema Definition Layer:**
- Purpose: Declarative config schemas organized by functional groups
- Contains: Configuration constants, group enums, flattened lookup maps
- Location: `characterConfigSchema.ts`, `weaponConfigSchema.ts`
- Depends on: types.ts
- Used by: RCON integration layer

**Validation & Conversion Layer:**
- Purpose: Convert JavaScript types to RCON command format
- Contains: `validateAndConvertDataType()` function
- Location: `rconExamples.ts` (lines 22-75)
- Depends on: types.ts for DataType enum
- Used by: RCON send functions

**Integration Layer:**
- Purpose: RCON client connection and command sending
- Contains: `sendWeaponConfigUpdate()`, `sendCharacterConfigUpdate()`
- Location: `rconExamples.ts` (lines 77-102)
- Depends on: All schema files, rcon-client package
- Used by: External consumers

## Data Flow

**Configuration Update Flow:**

1. User provides config value (e.g., `{ weaponName, groupName, configKey, value }`)
2. Lookup config entry from flat map (`weaponConfigFlatMap[configKey]`)
3. Validate and convert value via `validateAndConvertDataType()`
   - Type checking against `DataType` enum
   - Format conversion (e.g., boolean → "True"/"False", vector → "X=0.00,Y=0.00,Z=0.00")
4. Build RCON command string: `string ezconfig [Entity] [Group] [Key] [Value]`
5. Send via `rcon.send()` to game server
6. Log response (success path only)

**State Management:**
- Stateless - each config update is independent
- RCON connection established at module load (top-level await)
- No persistent state or caching

## Key Abstractions

**ConfigEntry:**
- Purpose: Standardized shape for all configuration options
- Fields: configKey, dataType, isImplemented, documentation, default
- Location: `types.ts` (lines 11-17)
- Pattern: Interface with discriminated union potential (via dataType)

**Flat Map Pattern:**
- Purpose: O(1) lookup for config entries by key
- Examples: `characterConfigFlatMap`, `weaponConfigFlatMap`
- Location: End of each schema file
- Pattern: Reduce array to object with configKey as key

**Type-Safe Keys:**
- Purpose: Branded types for compile-time config key validation
- Examples: `CharacterConfigKeyType`, `WeaponConfigKeyType`
- Location: Schema file exports
- Pattern: `keyof typeof flatMap`

## Entry Points

**Module Entry:**
- Location: `rconExamples.ts`
- Triggers: Import of module
- Responsibilities: Establish RCON connection, export API functions

**Public API:**
- `sendCharacterConfigUpdate()` - Update character configuration
- `sendWeaponConfigUpdate()` - Update weapon configuration
- Schema exports for UI consumption

## Error Handling

**Strategy:** Throw on validation failure, no catch at integration layer

**Patterns:**
- Validation throws `Error` with descriptive message including config key
- No try/catch around RCON send operations (gap identified)
- Success logging only (`console.log` on line 101)

## Cross-Cutting Concerns

**Logging:**
- Console.log for success responses only
- No structured logging framework
- No error logging (gap identified)

**Validation:**
- Runtime type checking in `validateAndConvertDataType()`
- Supports: Boolean, Float, FloatArray, Vector, Vector2D
- Throws on type mismatch

**Configuration:**
- Hardcoded RCON credentials (security concern identified)
- No environment variable usage yet

---

*Architecture analysis: 2026-01-23*
*Update when major patterns change*
