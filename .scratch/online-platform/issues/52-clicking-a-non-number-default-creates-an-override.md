# 52: Clicking a switch's default sets the opposite value

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
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

Decided by the owner on 2026-11-03: one click on a Bool's default sets the
opposite value, since that is the only change a Bool can make. The override then
differs from the default, and Reset undoes it.
- A Bool with no single default (it varies, or is unavailable) sets `true`, as it
  does today.
- String choices, vectors and arrays keep seeding the default. They have no empty
  state to open.

## Acceptance criteria

- [ ] One click on a Bool's default of `false` stores `true`, and one on a default
      of `true` stores `false`. The switch shows the new value, and the bar shows
      Unapplied changes.
- [ ] Reset removes the override, and the row shows the default again.
- [ ] A Bool with no single default sets `true`.
- [ ] String choices, vectors and arrays behave as they did.
- [ ] The All weapons sheet follows the same rule.
- [ ] Checked in a browser.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
