# UAT Issues: Phase 25 Plan 01

**Tested:** 2026-01-27
**Source:** .planning/phases/25-ui-simplification/25-01-SUMMARY.md
**Tester:** User via /gsd:verify-work

## Open Issues

[None - all issues resolved]

## Resolved Issues

### UAT-001: Cannot apply "Game Defaults" preset - Apply button disabled with 0 commands

**Resolved:** 2026-01-27 - Fixed in 25-01-FIX.md
**Commit:** 5cbf185

**Discovered:** 2026-01-27
**Phase/Plan:** 25-01
**Severity:** Major
**Feature:** Apply to Game dialog
**Description:** When trying to apply game defaults (all values reset), the "Apply 0 Commands" button is disabled. User cannot send the wipe command to reset everything to defaults.
**Expected:** Should be able to apply even with 0 commands to send the wipe/reset command to game
**Actual:** Apply button disabled when command count is 0
**Fix:** Updated disabled logic to allow 0 commands when wipeDatabase is checked; button text shows "Wipe Database" when 0 commands

### UAT-002: Weapons tab "Show overrides only" filter shows nothing

**Resolved:** 2026-01-27 - Fixed in 25-01-FIX.md
**Commit:** b055e1d

**Discovered:** 2026-01-27
**Phase/Plan:** 25-01
**Severity:** Major
**Feature:** Weapons config tab - overrides filter
**Description:** Toggling "Show overrides only" in Weapons tab never shows anything, even when there are configured overrides.
**Expected:** Should show only weapons/categories with configured values
**Actual:** Shows empty state regardless of configured values
**Fix:** Replaced API fetch with store-derived overrideMap computed from configStore.values.weapons

---

*Phase: 25-ui-simplification*
*Plan: 01*
*Tested: 2026-01-27*
