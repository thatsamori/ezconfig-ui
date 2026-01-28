# Deferred Issues

Enhancement ideas and non-blocking improvements logged during development.

## Open

### ISS-001: Improve responsiveness of float/vector inputs with save confirmation indicator

**Logged:** 2026-01-27
**Source:** UAT of Phase 24-01
**Priority:** Low (enhancement)
**Description:** Float and vector inputs send value updates on blur. Editing these values feels slightly slow because the UI waits for server confirmation before reflecting the change.

**Enhancement Ideas:**
1. Show optimistic updates immediately (current behavior is to wait)
2. Add a small green checkmark indicator next to inputs after server confirms save
3. Consider debounced saves instead of blur-only saves

**Note:** This is a UX polish item, not a functional bug. Current behavior works correctly.

---

## Resolved

[None yet]
