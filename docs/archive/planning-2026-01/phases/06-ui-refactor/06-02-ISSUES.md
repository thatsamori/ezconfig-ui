# UAT Issues: Phase 6 Plan 02

**Tested:** 2026-01-25
**Source:** .planning/phases/06-ui-refactor/06-02-SUMMARY.md
**Tester:** User via /gsd:verify-work

## Open Issues

[None]

## Resolved Issues

### UAT-002: Character config changes do not persist

**Discovered:** 2026-01-25
**Resolved:** 2026-01-25
**Phase/Plan:** 06-02
**Severity:** Major
**Feature:** Character config persistence
**Description:** Character tab config changes were lost on page reload
**Root Cause:** CharacterConfigTab was still using deprecated v0.1 store API (characterValues, setCharacterValue) which doesn't persist to localStorage
**Fix:** Refactored CharacterConfigTab to use new store model (workingValues/savedValues with setWorkingValue/removeWorkingValue)
**Commit:** d6b5d1c

### UAT-001: Config values cannot be edited

**Discovered:** 2026-01-25
**Resolved:** 2026-01-25
**Phase/Plan:** 06-02
**Severity:** Blocker
**Feature:** Value editing in WeaponAccordion
**Description:** When user tries to edit config values (toggles, number fields), nothing happens. Inputs don't respond to clicks or typing.
**Root Cause:** WeaponAccordion subscribed to function references from store (getEffectiveValue) instead of actual state values (workingValues, savedValues). When state changed, component didn't re-render.
**Fix:**
- Redesigned ConfigRow with two-state UX: "Game Default" badge when undefined, edit widget when customized
- Added removeWorkingValue() action to store for reset functionality
- Fixed WeaponAccordion to subscribe to actual state values for proper reactivity
**Commit:** 675bc48

---
*Phase: 06-ui-refactor*
*Plan: 02*
*Tested: 2026-01-25*
