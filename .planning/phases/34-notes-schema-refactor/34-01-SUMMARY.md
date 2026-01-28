---
phase: 34-notes-schema-refactor
plan: 01
subsystem: notes
provides: [per-schema-notes-storage]
affects: [35-notes-ui-update]
key-decisions:
  - Move getSchemaFromDatabase to types.ts (client-safe)
key-files:
  - src/lib/notes/service.ts
  - src/lib/notes/types.ts
  - src/app/api/notes/[schema]/route.ts
  - src/lib/hooks/useNotes.ts
  - src/components/weapons/ConfigRow.tsx
---

# Phase 34 Plan 01: Notes Schema Refactor Summary

**Changed notes storage from per-category to per-schema files, making notes shared across all categories.**

## Accomplishments

- Changed storage structure from `Notes/{database}/{category}.json` to `Notes/{schema}.json`
- Notes for a config key (e.g., CanCombo) are now shared across all categories where it appears
- Simplified API route from `/api/notes/[...path]` to `/api/notes/[schema]`
- Updated useNotes hook to take schema instead of database/category
- Added `getSchemaFromDatabase()` helper to derive schema from database path

## Files Created/Modified

- `src/lib/notes/service.ts` - Simplified to per-schema storage
- `src/lib/notes/types.ts` - Added getSchemaFromDatabase helper (client-safe)
- `src/app/api/notes/[schema]/route.ts` - New simplified route (deleted old [...path])
- `src/lib/hooks/useNotes.ts` - Changed to schema-based access
- `src/components/weapons/ConfigRow.tsx` - Uses getSchemaFromDatabase to derive schema

## Decisions Made

- Put `getSchemaFromDatabase` in types.ts instead of service.ts because service.ts has fs imports that can't be used in client components

## Issues Encountered

- Initial attempt to import from service.ts failed because fs/promises can't resolve in client components
- Fixed by moving the helper function to types.ts which has no fs dependencies

## Next Step

Phase 35 UI changes are complete (done as part of this phase). Ready for Phase 36 migration if needed.
