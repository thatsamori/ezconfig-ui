# UAT Issues: Phase 14 Plan 01

**Tested:** 2026-01-26
**Source:** .planning/phases/14-object-format/14-01-SUMMARY.md
**Tester:** User via /gsd:verify-work

## Open Issues

[None]

## Resolved Issues

### UAT-001: Frontend still sends array format, API rejects with "entries object" error

**Discovered:** 2026-01-26
**Resolved:** 2026-01-26
**Phase/Plan:** 14-01
**Severity:** Blocker
**Feature:** Save config changes
**Description:** When saving config changes, toast error appears: "Failed to save some changes: Character/Movement: Request body must contain "entries" object"
**Expected:** Config saves successfully with new object format
**Actual:** API rejects request because frontend is still sending old array format

**Root cause:** The frontend components weren't updated to match the new object format:
- `ActionButtons.tsx`: `buildMergedEntries` returned array format instead of object
- `CharacterConfigTab.tsx`: Parsed API response expecting array format
- `WeaponAccordion.tsx`: Parsed API response expecting array format
- `PresetsTab.tsx`: Created ZIP exports with array format

**Fix:** Updated all 4 files to use object format:
- `buildMergedEntries` now returns `Record<string, ConfigValue>` directly
- Components iterate `Object.entries(json.data)` instead of `for (const entry of json.data)`
- Preset export writes `values` directly instead of converting to array

---

*Phase: 14-object-format*
*Plan: 01*
*Tested: 2026-01-26*
