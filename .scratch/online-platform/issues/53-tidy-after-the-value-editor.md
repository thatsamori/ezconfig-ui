# 53: Tidy after the value editor

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Small leftovers the check of `main` at `d04dfcb` found. None changes what reaches
a game server. Its write-up is `check-main-d04dfcb.md` in the shared notes folder.

- After a stale review reopens, focus lands on the page body instead of a control
  in the review.
- The mod's `.scratch/movement-rules/spec.md` (about line 204) still states the
  old "Use value" rule. Add a line there pointing at
  [Every value edits the same way](49-every-value-edits-the-same-way.md). That
  file is in the mod repo, so it is a commit there.

## Acceptance criteria

- [ ] A review reopened as stale takes focus on a control in it, as a first review
      does. Checked in a browser.
- [ ] The mod's spec points at #49.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
