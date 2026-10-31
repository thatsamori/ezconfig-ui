# UAT Issues: Phase 3 Plan 1

**Tested:** 2026-01-23
**Source:** .planning/phases/03-integration/03-01-SUMMARY.md
**Tester:** User via /gsd:verify-work

## Open Issues

[None]

## Resolved Issues

### UAT-001: Loaded weapon config values not marked as staged

**Discovered:** 2026-01-23
**Resolved:** 2026-01-23 - Fixed immediately during UAT
**Phase/Plan:** 03-01
**Severity:** Major
**Commit:** d4fcbc3

**Root cause:** Parser was storing keys as `IsParryHeld` but UI expected `General_IsParryHeld` (with group prefix). The initializeFromGameIni function was correctly setting staged=true, but under the wrong key name.

**Fix:** Parser now builds full key including group prefix: `${currentSection.group}_${key}`

---

*Phase: 03-integration*
*Plan: 01*
*Tested: 2026-01-23*
