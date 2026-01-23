# Codebase Concerns

**Analysis Date:** 2026-01-23

## Tech Debt

**Hardcoded RCON credentials:**
- Issue: Connection host, port, and password hardcoded in source file
- File: `rconExamples.ts` (lines 15-19)
- Why: Rapid prototyping
- Impact: Security risk if code is shared, can't easily switch servers
- Fix approach: Move to environment variables, create .env.example

**No project structure:**
- Issue: All code files in root directory
- Files: All `.ts` files in root
- Why: Early project stage
- Impact: Will become messy as project grows
- Fix approach: Create `src/` directory with proper module organization

## Known Bugs

**Type mismatch in sendCharacterConfigUpdate:**
- Symptoms: Passing `configKey` (string) to `validateAndConvertDataType` instead of full `ConfigEntry` object
- File: `rconExamples.ts` (line 94)
- Trigger: Calling `sendCharacterConfigUpdate()` would fail
- Workaround: Not in active use, just example code
- Root cause: Missing lookup of config entry from `characterConfigFlatMap`
- Fix: Add `const configEntry = characterConfigFlatMap[configKey]` before validation

## Security Considerations

**Exposed credentials in source:**
- Risk: RCON password visible in `rconExamples.ts`
- File: `rconExamples.ts` (line 18: `password: "ezbones"`)
- Current mitigation: File is example code
- Recommendations:
  1. Move to .env file
  2. Add .env to .gitignore
  3. Create .env.example with placeholder values

**No input validation at API boundary (future):**
- Risk: When UI is built, user input will need sanitization
- File: Future concern
- Current mitigation: No API exists yet
- Recommendations: Plan for input validation when building API layer

## Performance Bottlenecks

**No significant performance concerns detected.**

The codebase is schema definitions and simple RCON commands - inherently lightweight.

## Fragile Areas

**Type validation switch statement:**
- File: `rconExamples.ts` (lines 21-74)
- Why fragile: If/else chain for each DataType, easy to miss a case
- Common failures: New DataType added without handler
- Safe modification: Add exhaustive check at end, or use switch with TypeScript exhaustiveness checking
- Test coverage: None

## Scaling Limits

**Not applicable at current stage.**

Project is local tooling, not a scalable service.

## Dependencies at Risk

**rcon package:**
- Package: rcon ^1.1.0
- Risk: Last published 7+ years ago (2016)
- Impact: May have compatibility issues with modern Node/Bun
- Note: rcon-client (more recent, 2021) is also included and may be sufficient alone

## Missing Critical Features

**Environment variable support:**
- Problem: No .env loading or env var configuration
- Files: `rconExamples.ts` (hardcoded values)
- Current workaround: Edit source code directly
- Blocks: Cannot safely share code, cannot switch servers easily
- Implementation complexity: Low (add .env file, use process.env)

**No test infrastructure:**
- Problem: No tests for validation logic
- Files: All source files untested
- Current workaround: Manual testing
- Blocks: Safe refactoring, CI/CD pipeline
- Implementation complexity: Low (Bun has built-in test runner)

## Test Coverage Gaps

**All code is untested:**
- What's not tested: Everything
- Risk: Validation bugs, data formatting errors
- Priority: Medium (project is early stage)
- Difficulty to test: Low - pure functions are easily testable

**Specific gaps:**
1. `validateAndConvertDataType` - Critical function, no tests
2. Config flat map generation - Derived data, should verify completeness
3. RCON command formatting - String output, easily testable

---

*Concerns audit: 2026-01-23*
*Update as issues are fixed or new ones discovered*
