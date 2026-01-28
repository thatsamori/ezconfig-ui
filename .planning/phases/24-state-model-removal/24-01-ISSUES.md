# UAT Issues: Phase 24 Plan 01

**Tested:** 2026-01-27
**Source:** .planning/phases/24-state-model-removal/24-01-SUMMARY.md
**Tester:** User via /gsd:verify-work

## Open Issues

[None - all issues resolved]

## Resolved Issues

### UAT-001: Edit button doesn't respond - workingValues alias incompatible with Zustand subscriptions

**Resolved:** 2026-01-27 - Fixed immediately during UAT
**Commit:** bca1cba

**Discovered:** 2026-01-27
**Phase/Plan:** 24-01
**Severity:** Blocker
**Feature:** Editing config values (clicking Edit/pencil button)
**Description:** Clicking the Edit button to toggle off "Game Default" state has no effect. UI doesn't respond. No visual change occurs.
**Expected:** Clicking Edit should set the value to the schema default and show the input control.
**Actual:** Nothing happens. The row remains in "Game Default" state.
**Root Cause:** The deprecated `workingValues` and `savedValues` aliases were implemented as JavaScript getters (`get workingValues() { return get().values; }`), but Zustand selectors don't work with getters. Components subscribing via `useConfigStore((state) => state.workingValues)` didn't re-render when `values` changed because the getter function itself doesn't change.

**Fix Applied:** Changed deprecated aliases from getters to actual state properties that are updated alongside `values` in every state mutation.

---

*Phase: 24-state-model-removal*
*Plan: 01*
*Tested: 2026-01-27*
