---
phase: 15-on-demand-storage
plan: 01
subsystem: database
tags: [storage, cleanup, filesystem]

# Dependency graph
requires:
  - phase: 14-object-format
    provides: Object format for JSON storage
provides:
  - On-demand file storage (files created only when data exists)
  - Automatic file deletion when data becomes empty
  - Empty directory cleanup
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - On-demand storage: write empty object deletes file
    - Directory cleanup: empty parents removed up to databases root

key-files:
  created: []
  modified:
    - src/lib/database/service.ts

key-decisions:
  - "cleanupEmptyDirectories stops at getDatabasesRoot() to preserve root"
  - "ENOENT errors ignored during deletion (file already gone)"

patterns-established:
  - "Empty config = no file on disk (reduces clutter)"

issues-created: []

# Metrics
duration: 3min
completed: 2026-01-26
---

# Phase 15 Plan 01: On-Demand Storage Summary

**Implemented on-demand file storage: files created only when data exists, deleted when empty**

## Performance

- **Duration:** 3 min
- **Completed:** 2026-01-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `unlink` and `rmdir` to fs/promises imports
- Created `cleanupEmptyDirectories(dirPath)` helper that walks up directory tree
- Modified `writeCategory` to delete file when data is empty object `{}`
- Directory cleanup stops at databases root to prevent deleting it
- ENOENT errors ignored during deletion (idempotent behavior)
- Added Test 6: Writing empty object deletes file
- Added Test 7: Empty directory cleanup verification
- All 7 tests pass

## Task Commits

Tasks implemented together (single logical change):

1. **Task 1: Update writeCategory for on-demand storage** - Core logic
2. **Task 2: Add on-demand storage tests** - Tests 6 & 7

## Files Modified

- `src/lib/database/service.ts`
  - Added `cleanupEmptyDirectories` helper function
  - Modified `writeCategory` to delete files when data is empty
  - Added Tests 6 & 7 for on-demand behavior
  - Updated cleanup section for new test scenarios

## Verification

- [x] `bunx tsc --noEmit` passes (no type errors)
- [x] `bun run src/lib/database/service.ts` - all 7 tests pass
- [x] Dev server runs (port 3000 already in use - server running)

## Deviations from Plan

None - plan executed exactly as specified.

## Issues Encountered

None - implementation was straightforward.

## Behavior Summary

| Action | Before | After |
|--------|--------|-------|
| Write `{ key: value }` | Creates file | Creates file (unchanged) |
| Write `{}` | Creates empty file | Deletes file |
| Read deleted file | Error | Returns `{}` (unchanged) |
| Delete last file in dir | Dir remains | Dir deleted |

---
*Phase: 15-on-demand-storage*
*Completed: 2026-01-26*
