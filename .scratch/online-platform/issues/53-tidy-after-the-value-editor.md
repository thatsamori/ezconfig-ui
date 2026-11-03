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

Added from the check of `main` at `9f3df3a` (`check-main-9f3df3a.md`):

- The refused review opened from the game server page says "No changes; the server
  will be sent this configuration again" beside a disabled Apply.
- After Discard changes, a stored 1e999 reads "got object" where Live said "got
  Infinity", and the review shows "null → game default".

Added from the comments on
[The review leaves out a refused value](51-review-leaves-out-a-refused-value.md):

- Save as Ruleset version with a refused value open leaves it out without saying
  so. Read from the code, not run.

## Acceptance criteria

- [ ] A review reopened as stale takes focus on a control in it, as a first review
      does. Checked in a browser.
- [ ] The mod's spec points at #49.
- [ ] A refused review doesn't say the configuration will be sent again.
- [ ] A stored 1e999 reads the same before and after Discard changes.
- [ ] Save as Ruleset version says when it leaves out a refused value.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
