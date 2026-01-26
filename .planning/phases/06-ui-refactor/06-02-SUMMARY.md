---
phase: 06-ui-refactor
plan: 02
subsystem: ui
tags: [accordion, lazy-loading, radix-ui, shadcn]

# Dependency graph
requires:
  - phase: 06-ui-refactor
    provides: Working/saved state model in configStore
  - phase: 05-database-layer
    provides: API endpoints /api/databases and /api/config/{database}/{category}
provides:
  - Accordion-based weapon list (single open at a time)
  - Lazy loading of weapon config on accordion expand
  - Simplified ConfigRow without staged checkbox
affects: [07-apply-flow, 08-polish]

# Tech tracking
tech-stack:
  added:
    - "@radix-ui/react-accordion"
  patterns:
    - "Accordion with type=single collapsible"
    - "Lazy load on accordion expand via onValueChange"
    - "Fetch from /api/config then setSavedValue per entry"

key-files:
  created:
    - src/components/ui/accordion.tsx
    - src/components/weapons/WeaponAccordion.tsx
  modified:
    - src/components/weapons/WeaponConfigTab.tsx
    - src/components/weapons/ConfigRow.tsx
    - src/components/weapons/index.ts
    - src/components/character/CharacterConfigTab.tsx
  deleted:
    - src/components/weapons/WeaponSelector.tsx

key-decisions:
  - "Single accordion open at a time (type=single collapsible)"
  - "Lazy load all categories on first expand (no partial loading)"

patterns-established:
  - "Accordion item per weapon, CollapsibleSection per category inside"
  - "loadWeaponConfig() fetches all categories then marks loaded"

issues-created: []

# Metrics
duration: 8 min
completed: 2026-01-25
---

# Phase 6 Plan 02: Accordion UI + Lazy Loading Summary

**Accordion-based weapon list with lazy loading replaces bulk selection, simplified ConfigRow removes staged checkbox**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-25
- **Completed:** 2026-01-25
- **Tasks:** 4
- **Files modified:** 6 (1 deleted, 2 created)

## Accomplishments

- Accordion-based weapon list replaces bulk checkbox selection
- Lazy loading fetches config from API on accordion expand
- ConfigRow simplified - no more staged checkbox
- WeaponSelector deleted (bulk selection paradigm gone)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Shadcn Accordion component** - `263ce05` (feat)
2. **Task 2: Create WeaponAccordion with lazy loading** - `8bff1df` (feat)
3. **Task 3: Update WeaponConfigTab, simplify ConfigRow** - `e3855b5` (feat)
4. **Task 4: Human verification** - (checkpoint, no commit)

## Files Created/Modified

- `src/components/ui/accordion.tsx` - Shadcn Accordion component from Radix UI
- `src/components/weapons/WeaponAccordion.tsx` - New accordion-based weapon list with lazy loading
- `src/components/weapons/WeaponConfigTab.tsx` - Now uses WeaponAccordion, fetches from /api/databases
- `src/components/weapons/ConfigRow.tsx` - Simplified: removed staged checkbox and related props
- `src/components/weapons/index.ts` - Added WeaponAccordion export, removed WeaponSelector export
- `src/components/character/CharacterConfigTab.tsx` - Updated to use new ConfigRow API
- `src/components/weapons/WeaponSelector.tsx` - Deleted (bulk selection no longer needed)

## Decisions Made

- **Single accordion open at a time:** Using `type="single" collapsible` ensures only one weapon expanded, reducing visual clutter and memory usage
- **Lazy load all categories together:** On first expand, fetch all 5 categories (General, Strike, AltStrike, Stab, AltStab) at once rather than on-demand per section

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated CharacterConfigTab to use new ConfigRow API**
- **Found during:** Task 3 (ConfigRow simplification)
- **Issue:** After removing `staged` and `onStagedChange` props from ConfigRow, CharacterConfigTab failed to compile because it still used the old API
- **Fix:** Updated CharacterConfigTab to use the new simplified ConfigRow API. Added comment noting this is a temporary compatibility implementation
- **Files modified:** src/components/character/CharacterConfigTab.tsx
- **Verification:** `bun run build` succeeds
- **Committed in:** e3855b5 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (blocking issue)
**Impact on plan:** Auto-fix was necessary to maintain build. CharacterConfigTab still uses deprecated v0.1 store API and will need full refactoring in a future plan.

## Issues Encountered

None

## Next Phase Readiness

- Phase 6 complete: Store refactor + accordion UI done
- Ready for Phase 7: Apply Flow (Save/Reset/Apply buttons)
- Note: CharacterConfigTab uses temporary compatibility layer, may need dedicated plan

---
*Phase: 06-ui-refactor*
*Completed: 2026-01-25*
