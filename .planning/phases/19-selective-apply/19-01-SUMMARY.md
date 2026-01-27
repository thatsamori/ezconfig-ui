---
phase: 19-selective-apply
plan: 01
subsystem: ui
tags: [dialog, checkbox, rcon, apply, shadcn]

# Dependency graph
requires:
  - phase: 07-apply-flow
    provides: ActionButtons component with Apply to Game button
provides:
  - SelectiveApplyDialog component for granular apply control
  - GET /api/apply/preview endpoint for command list
  - Selective apply via commands array in POST /api/apply
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fetch-on-open dialog pattern"
    - "Checkbox list with select all/deselect all"
    - "Search filter preserving selection state"

key-files:
  created:
    - src/app/api/apply/preview/route.ts
    - src/components/SelectiveApplyDialog.tsx
  modified:
    - src/app/api/apply/route.ts
    - src/components/ActionButtons.tsx

key-decisions:
  - "Show full command strings in list (users can search to find specific commands)"
  - "Moved password input from window.prompt to dialog for better UX"

patterns-established:
  - "Selective apply pattern: preview commands, select subset, apply"

issues-created: []

# Metrics
duration: 2 min
completed: 2026-01-27
---

# Phase 19 Plan 01: Selective Apply Summary

**SelectiveApplyDialog with command preview, checkboxes, search filter, and selective RCON command sending**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-27T05:05:40Z
- **Completed:** 2026-01-27T05:07:53Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- GET /api/apply/preview endpoint returns list of RCON commands from saved config
- SelectiveApplyDialog with scrollable command list, checkboxes, and search
- Select All / Deselect All buttons for quick selection
- Apply endpoint accepts optional commands array for selective apply
- Replaced window.prompt with proper dialog for password input

## Task Commits

Each task was committed atomically:

1. **Task 1: Create preview endpoint for commands** - `b76440a` (feat)
2. **Task 2: Create SelectiveApplyDialog component** - `a2519c3` (feat)
3. **Task 3: Update apply endpoint and integrate dialog** - `97e7feb` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/app/api/apply/preview/route.ts` - New endpoint returning command list
- `src/components/SelectiveApplyDialog.tsx` - Dialog with command selection UI
- `src/app/api/apply/route.ts` - Extended to accept optional commands array
- `src/components/ActionButtons.tsx` - Integrated SelectiveApplyDialog

## Decisions Made

- Show full command strings in list - users can use search to find specific commands
- Moved password input from window.prompt to SelectiveApplyDialog for better UX

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 19 complete — Selective apply functionality fully implemented
- Ready for Phase 20: Overrides Filter

---
*Phase: 19-selective-apply*
*Completed: 2026-01-27*
