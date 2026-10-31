---
phase: 05-database-layer
plan: 02
subsystem: api
tags: [rcon, json, filesystem, endpoints]

# Dependency graph
requires:
  - phase: 05-01
    provides: database service layer, config API, schema validation
provides:
  - GET /api/databases endpoint for UI navigation
  - POST /api/apply endpoint for RCON integration
  - init-databases script for folder initialization
affects: [06-ui-refactor, 07-apply-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grouped vs flat database structure detection"
    - "RCON command building from JSON entries"
    - "Password-protected API endpoints"

key-files:
  created:
    - src/lib/database/structure.ts
    - src/lib/database/apply.ts
    - src/app/api/databases/route.ts
    - src/app/api/apply/route.ts
    - scripts/init-databases.ts
  modified:
    - src/lib/env.ts
    - package.json

key-decisions:
  - "Scan filesystem on each GET /api/databases call (caching can be added in Polish phase)"
  - "WipeDatabases sent before all category commands"
  - "RCON database name is subdirectory name for grouped databases (e.g., Greatsword not Weapon/Greatsword)"

patterns-established:
  - "Grouped database detection: no JSON files + has subdirectories = group"
  - "Category extraction: JSON filename without extension"

issues-created: []

# Metrics
duration: 8 min
completed: 2026-01-25
---

# Phase 5 Plan 02: Databases Structure & Apply Endpoints Summary

**GET /api/databases returns nested database structure, POST /api/apply sends config to game via RCON with password auth**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-25
- **Completed:** 2026-01-25
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Database structure scanning with flat vs grouped database detection
- Apply endpoint with password authentication and RCON integration
- Init script creates 178 JSON files for all weapons and character categories

## Task Commits

Each task was committed atomically:

1. **Task 1: Create databases structure endpoint** - `4c7255f` (feat)
2. **Task 2: Create apply endpoint with RCON integration** - `e5a173c` (feat)
3. **Task 3: Initialize Databases folder structure** - `cf48586` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/lib/database/structure.ts` - Database structure scanning (flat vs grouped detection)
- `src/lib/database/apply.ts` - RCON command building and execution
- `src/app/api/databases/route.ts` - GET endpoint for database structure
- `src/app/api/apply/route.ts` - POST endpoint for applying config to game
- `scripts/init-databases.ts` - Idempotent folder initialization
- `src/lib/env.ts` - Added ezconfigPassword config
- `package.json` - Added init-db script

## Decisions Made

- Scan filesystem on each GET /api/databases call (no caching for v1.0)
- WipeDatabases command always sent first to clear game state
- RCON database name is the subdirectory name (Greatsword, not Weapon/Greatsword)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 5 complete — database layer fully functional
- Ready for Phase 6: UI Refactor (accordion-based weapon list, lazy loading)

---
*Phase: 05-database-layer*
*Completed: 2026-01-25*
