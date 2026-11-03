# 31: Stale saves across tabs

Status: open
Type: task
Created: 2026-11-02
Blocked by: 30
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner with two tabs open on one Draft never loses an edit silently.
A write based on an old revision is rejected. The rejected tab reloads the
Draft and names the edits it did not save. Open tabs refresh the Draft every
few seconds, so an idle tab rarely meets a rejection. There is no per-key
merge.

## Acceptance criteria

- [ ] Every Draft write that exists so far (auto-save and Reset to game
      defaults) carries its base revision and is rejected if the Draft has
      moved on. The rejection returns the current Draft.
      [Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) and
      [Rulesets](35-rulesets.md) add their writes under this same check.
- [ ] A rejected tab replaces its Draft with the current one and tells the
      owner which edits were not saved, naming database, weapon and key.
- [ ] Open pages fetch the Draft again every few seconds and pick up another
      tab's saves without a reload.
- [ ] Route-handler tests cover two writers on the same revision: exactly one
      succeeds, and the other gets the rejection with the current Draft.
- [ ] A component or store test covers the rejected tab naming its unsaved
      edits.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
