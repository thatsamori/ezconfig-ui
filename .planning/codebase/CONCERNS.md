# Codebase Concerns

**Analysis Date:** 2026-01-23

## Security Issues

**Hardcoded RCON Credentials:**
- Issue: Server host, port, and password hardcoded in source code
- File: `rconExamples.ts` (lines 16-20)
- Risk: Credentials exposed in version control (file is gitignored but pattern is dangerous)
- Current mitigation: File added to `.gitignore` line 36
- Fix approach: Move to environment variables, create `.env.example` template

## Critical Bugs

**Vector/Vector2D Data Type Mismatch:**
- Issue: Schema defines vectors as objects `{x, y, z}` but validation expects arrays `[x, y, z]`
- Files:
  - Schema objects: `characterConfigSchema.ts` (lines 433, 440, 447, etc.), `weaponConfigSchema.ts` (lines 269, 405, etc.)
  - Validation: `rconExamples.ts` (lines 52-74)
- Example schema: `default: { x: 75.0, y: 0.0, z: -35.0 }`
- Validation expects: `Array.isArray(configValue) && configValue.length === 3`
- Impact: Runtime failure when trying to use Vector or Vector2D config values
- Fix approach: Either change schema defaults to arrays or update validation to accept object format

## Error Handling

**Missing Error Handling for RCON Operations:**
- Issue: No try/catch around `rcon.send()` calls
- Files: `rconExamples.ts` (lines 85-87, 97-99)
- Impact: Unhandled promise rejections, silent failures
- Fix approach: Add try/catch with proper error logging

**Missing Error Logging:**
- Issue: Only success logging present, no error logs
- File: `rconExamples.ts` (line 101 has console.log for success only)
- Impact: Difficult to debug failures
- Fix approach: Add console.error for failures

**Validation Function Silent Return:**
- Issue: `validateAndConvertDataType()` returns undefined if no dataType matches
- File: `rconExamples.ts` (line 75 - function ends without return for unhandled types)
- Impact: Could send malformed RCON commands
- Fix approach: Add exhaustive type checking or throw for unknown types

## Type Safety

**Loose `any` Types:**
- Issue: `default: any` in ConfigEntry defeats TypeScript type safety
- File: `types.ts` (line 15)
- Impact: No compile-time validation of default values
- Fix approach: Use generic type or union type for default values

**Function Parameters Using `any`:**
- Issue: `configValue: any` in validation and send functions
- Files: `rconExamples.ts` (lines 23, 81, 93)
- Impact: No compile-time type checking for config values
- Fix approach: Create union type or generic constraint

## Documentation

**Missing Environment Configuration:**
- Issue: No `.env.example` file despite needing credentials
- Impact: Developers don't know what env vars to set
- Fix approach: Create `.env.example` with placeholder values

**Empty Documentation Fields:**
- Issue: All 100+ config entries have `documentation: ""`
- Files: `characterConfigSchema.ts`, `weaponConfigSchema.ts`
- Impact: No guidance for users on what each config does
- Fix approach: Populate from game documentation

**Incomplete README:**
- Issue: README has incomplete run command (`bun run ` with no script)
- File: `README.md` (line 12)
- Impact: Users can't run the project from instructions
- Fix approach: Add proper run instructions

## Dependencies

**Floating Version:**
- Issue: `@types/bun: "latest"` uses unpinned version
- File: `package.json` (line 5)
- Impact: Build could break with new @types/bun release
- Fix approach: Pin to specific version (currently 1.3.6)

## Incomplete Implementation

**All Features Marked Unimplemented:**
- Issue: Every config entry has `isImplemented: false`
- Files: `characterConfigSchema.ts`, `weaponConfigSchema.ts`
- Impact: UI could show non-functional options
- Fix approach: Update as features are implemented or remove flag if not needed

## Performance Bottlenecks

**RCON Connection at Module Load:**
- Issue: Top-level await establishes connection on import
- File: `rconExamples.ts` (line 16)
- Impact: Module import blocks on network, cold start delay
- Fix approach: Lazy connection on first use or explicit connect function

## Test Coverage Gaps

**No Tests:**
- Issue: No test files exist
- Risk: Validation logic, schema generation, RCON formatting all untested
- Priority: High for `validateAndConvertDataType()` function
- Fix approach: Add Bun test suite for critical paths

---

*Concerns audit: 2026-01-23*
*Update as issues are fixed or new ones discovered*
