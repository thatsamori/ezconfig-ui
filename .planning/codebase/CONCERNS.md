# Codebase Concerns

**Analysis Date:** 2026-01-27

## Tech Debt

**Deprecated store aliases:**
- Issue: ConfigStore has deprecated aliases (workingValues, savedValues, setWorkingValue, etc.)
- Files: `src/lib/store/configStore.ts` (lines 29-39, 375-410)
- Why: Migration from working/saved model to single source of truth
- Impact: Extra code complexity, potential confusion
- Fix approach: Remove deprecated aliases after confirming no UI code uses them

**Plain text password storage:**
- Issue: User passwords stored in plain text in users.json
- Files: `src/lib/auth/service.ts`, `users.json`
- Why: Quick implementation for local-only tool
- Impact: Security risk if users.json is exposed
- Fix approach: Add bcrypt or argon2 password hashing

## Known Bugs

- No known bugs reported
- No TODO/FIXME comments found in codebase

## Security Considerations

**Plain text passwords:**
- Risk: Passwords readable if users.json is accessed
- Files: `src/lib/auth/service.ts` (validateCredentials compares plain text)
- Current mitigation: File is local, not exposed via API
- Recommendations: Implement password hashing with bcrypt

**Admin role check client-side:**
- Risk: Admin-only UI (Users tab) hidden via client-side role check
- Files: `src/app/page.tsx` (lines 37-40, 50-53)
- Current mitigation: API routes verify auth via middleware
- Recommendations: API routes already protected, but double-check all admin endpoints

**Path traversal prevention:**
- Risk: Malicious paths could escape database directory
- Files: `src/lib/database/service.ts` (validatePathSecurity function)
- Current mitigation: Path validation rejects `..`, absolute paths, and `:` characters
- Recommendations: Current implementation is adequate

**RCON password in environment:**
- Risk: RCON password exposed in process environment
- Files: `src/lib/env.ts`, `.env`
- Current mitigation: .env is gitignored
- Recommendations: Consider using secrets manager in production

## Performance Bottlenecks

**No significant performance concerns detected:**
- File-based storage is fast for single-user scenarios
- RCON commands executed sequentially with 100ms delay (intentional)
- Client-side state management with Zustand is efficient

**Potential concern - Large preset loading:**
- Problem: Loading large presets clears all databases, then writes all categories
- Files: `src/lib/store/configStore.ts` (loadPreset function)
- Measurement: Not measured
- Cause: Sequential API calls for each category
- Improvement path: Consider bulk API endpoint for preset loading

## Fragile Areas

**Config schema updates:**
- Why fragile: Adding new config options requires manual schema updates
- Files: `src/lib/config/weaponConfigSchema.ts`, `src/lib/config/characterConfigSchema.ts`
- Common failures: New game config options not reflected in UI
- Safe modification: Add to WEAPON_CONFIG_OPTIONS or CHARACTER_CONFIG_OPTIONS arrays
- Test coverage: None

**RCON connection handling:**
- Why fragile: RCON connections can hang, timeout logic is manual
- Files: `src/lib/rcon/service.ts`
- Common failures: Connection hangs if server unresponsive
- Safe modification: 1000ms timeout on rcon.end() already implemented
- Test coverage: None

## Scaling Limits

**Single user design:**
- Current capacity: Single concurrent user
- Limit: Multiple users could cause race conditions on file writes
- Symptoms at limit: Data corruption, lost writes
- Scaling path: Not designed for multi-user; would need database with transactions

**File system storage:**
- Current capacity: Thousands of config files
- Limit: Very large number of presets or weapons
- Symptoms at limit: Slow directory scanning
- Scaling path: Adequate for intended use case

## Dependencies at Risk

**rcon-client:**
- Risk: Low maintenance activity
- Impact: RCON communication would break
- Migration plan: Protocol is simple, could implement directly if needed

**TipTap:**
- Risk: Complex rich text editor with many dependencies
- Impact: Notes feature would break
- Migration plan: Could simplify to plain textarea if needed

## Missing Critical Features

**No automated testing:**
- Problem: No test framework, only inline service tests
- Current workaround: Manual testing
- Blocks: Confident refactoring, regression detection
- Implementation complexity: Medium (add Vitest, write tests)

**No backup/restore:**
- Problem: No way to backup/restore entire configuration state
- Current workaround: Manual file copying, preset system partially covers this
- Blocks: Disaster recovery
- Implementation complexity: Low (zip Databases/ directory)

## Test Coverage Gaps

**All areas untested:**
- What's not tested: API routes, auth flow, RCON integration, UI components
- Risk: Bugs introduced silently during refactoring
- Priority: High for RCON and auth, Medium for others
- Difficulty to test: RCON requires mock or test server

**Critical paths without tests:**
- Config save/load flow
- RCON command generation and execution
- Authentication and authorization
- Preset import/export

---

*Concerns audit: 2026-01-27*
*Update as issues are fixed or new ones discovered*
