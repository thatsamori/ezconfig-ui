# 52: Clicking a default that isn't a number creates an override

Status: open
Type: task
Created: 2026-11-03
Blocked by: The owner's decision below
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Found by the check of `main` at `d04dfcb`. Its write-up is
`check-main-d04dfcb.md` in the shared notes folder.

One click on the default of a Bool such as `CustomFOV` creates an override equal
to the default, and the bar shows Unapplied changes. The owner then has to click
the switch to change it. `ValueEditor.tsx` does the same for the other kinds
that aren't Float, by seeding the default. It did this before
[Every value edits the same way](49-every-value-edits-the-same-way.md), whose
rule that looking at a value must not create an override covers number values
only.

## Decision for the owner

What should one click on a Bool's default do? The suggestion is that it sets the
opposite value, since that is the only change a Bool can make. The override then
differs from the default, and Reset undoes it.

The choice for the other kinds (String choices, vectors and arrays) follows from
this. They have no empty state to open, so they may keep seeding the default.

## Acceptance criteria

To be set once the owner has decided, along with:

- [ ] Checked in a browser.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
