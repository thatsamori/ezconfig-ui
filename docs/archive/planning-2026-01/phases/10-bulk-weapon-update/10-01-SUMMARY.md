---
phase: 10-bulk-weapon-update
plan: 01
subsystem: ui
tags: [context-menu, bulk-update, shadcn, zustand]

# Dependency graph
requires:
  - phase: 06-ui-refactor
    provides: WeaponAccordion component, ConfigRow component
  - phase: 05-database-layer
    provides: Database service, scanDatabaseStructure
provides:
  - Context menu "Apply to all weapons" on config rows
  - Batch API endpoint for bulk weapon updates
  - Store action for bulk working state updates
affects: []

# Tech tracking
tech-stack:
  added: [shadcn/context-menu]
  patterns: [bulk state updates, context menu actions]

key-files:
  created:
    - src/components/ui/context-menu.tsx
    - src/app/api/config/bulk-weapons/route.ts
  modified:
    - src/components/weapons/ConfigRow.tsx
    - src/components/weapons/WeaponAccordion.tsx
    - src/lib/store/configStore.ts

key-decisions:
  - "Context menu available on all rows, not just customized"
  - "Game Default rows show 'Reset all to default' option"
  - "Bulk updates go to working state, require Save to persist"

patterns-established:
  - "Context menu pattern for row-level actions"

issues-created: []

# Metrics
duration: 12min
completed: 2026-01-26
---

# Phase 10 Plan 01: Bulk Weapon Update Summary

**Context menu "Apply to all weapons" with confirmation dialog and batch working state updates**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-26T12:00:00Z
- **Completed:** 2026-01-26T12:12:00Z
- **Tasks:** 4 (3 auto + 1 checkpoint)
- **Files modified:** 5

## Accomplishments

- Installed shadcn context-menu component
- Added context menu to ConfigRow with bulk action option
- Created POST /api/config/bulk-weapons endpoint for batch updates
- Added setBulkWeaponValue store action for efficient batch state updates
- Wired up WeaponAccordion with confirmation dialog flow

## Task Commits

Each task was committed atomically:

1. **Task 1: Install context-menu and create ConfigRowWithContext wrapper** - `f780859` (chore)
2. **Task 2: Add POST /api/config/bulk-weapons endpoint** - `59a06b0` (feat)
3. **Task 3: Add store action and wire up to WeaponAccordion** - `b4b56c4` (feat)
4. **Bug fix: Enable context menu for game default rows** - `da78028` (fix)

## Files Created/Modified

- `src/components/ui/context-menu.tsx` - Shadcn context menu component
- `src/app/api/config/bulk-weapons/route.ts` - Batch API endpoint
- `src/components/weapons/ConfigRow.tsx` - Added context menu wrapper
- `src/components/weapons/WeaponAccordion.tsx` - Added confirmation dialog and handlers
- `src/lib/store/configStore.ts` - Added setBulkWeaponValue action

## Decisions Made

- Context menu available on ALL config rows (not just customized)
- Game Default rows show "Reset all to default" option
- Customized rows show "Apply to all weapons" option
- Bulk updates modify working state only (user must Save to persist)
- Confirmation dialog shows key, value, and weapon count

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Context menu not showing on Game Default rows**
- **Found during:** Task 4 (human-verify checkpoint)
- **Issue:** Context menu only appeared on customized rows, not Game Default rows
- **Fix:** Changed condition from `isCustomized && onApplyToAll` to just `onApplyToAll`; always pass onApplyToAll callback; use null (tombstone) for game default bulk apply
- **Files modified:** ConfigRow.tsx, WeaponAccordion.tsx
- **Verification:** Right-click works on both customized and Game Default rows
- **Commit:** da78028

---

**Total deviations:** 1 auto-fixed (bug)
**Impact on plan:** Bug fix necessary for complete functionality. No scope creep.

## Issues Encountered

None

## Next Phase Readiness

- Phase 10 complete - all bulk weapon update functionality working
- Milestone v1.0 complete - all 6 phases (5-10) finished
- Ready for /gsd:complete-milestone

---
*Phase: 10-bulk-weapon-update*
*Completed: 2026-01-26*
