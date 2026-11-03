# 52: Clicking a switch's default sets the opposite value

Status: completed
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

- [x] One click on a Bool's default of `false` stores `true`, and one on a default
      of `true` stores `false`. The switch shows the new value, and the bar shows
      Unapplied changes.
- [x] Reset removes the override, and the row shows the default again.
- [x] A Bool with no single default sets `true`.
- [x] String choices, vectors and arrays behave as they did.
- [x] The All weapons sheet follows the same rule.
- [x] Checked in a browser.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/competent-jang-af370b` (not pushed), on main
`e762748`. 253 tests pass across 45 files, typecheck is clean, and lint stays at
5. No migration.

- The rule is `valueFromDefault` in `src/components/console/model.ts`, and the
  default's click in `ValueEditor.tsx` calls it for everything except a Float. A
  Bool stores `baseline !== true`.
- The All weapons sheet uses the same `ValueEditor`, so it goes through the same
  branch. It names no weapon, so its default covers every weapon and attack type
  for that key. A key that varies anywhere sets `true`, even for an attack type
  where every weapon shares one default. A weapon whose default is already `true`
  then gets an override equal to it, and the sheet counts that as a change. That
  follows the owner's rule for no single default.
- Checked by hand on the built app (`next start`) on a temp database at
  `op50.localhost:3550`, in the browser pane (Chromium), set up as in
  [#50](50-mouse-wheel-changes-an-open-value.md):
  - `CustomFOV`, default `false`: one click stores `true`, the switch is on and the
    bar says Unapplied changes. `CustomFOVMax` stops being muted. Reset removes the
    override: the row shows "Default: false", the bar says Matches and `CustomFOVMax`
    is muted again.
  - `AllowDrop`, default `true`: one click stores `false`, the switch is off, and
    the review says "Added (1) General · AllowDrop false" with Apply focused. Reset
    goes back to "Default: true" and Matches.
  - `ChftpStunDisarms`, a feature parameter with a default of `true`, stores `false`
    while its toggle is off.
  - ArmingSword Strike `DismountsHorseRider`, default `false`, stores `true`.
  - As before: `ChftpStunAnimation` seeds "Default",
    `HighBlockColliderRelativeOffsetLocation` seeds 10, 0, -100, and ArmingSword
    Strike `Damage` seeds 60, 50, 37, 34.
  - All weapons sheet, Strike:
    - `NoFlinch`, "Default: false", sets `true`.
    - `CanMissCombo`, "Default: true", sets `false`. After Save, the Draft holds
      `false` for all 35 weapons.
    - `ForcesRearingFromFront`, "Default: false / true (varies)", sets `true`.
  - Console: no CSP violation, and no new error on this ticket's steps. Server log:
    no errors.
- Covered by unit tests only, not clicked in the browser:
  - A Bool with an unavailable default. No such key turned up: every Character Bool
    and every ArmingSword cell has one default, so "varies" shows only in the sheet.
  - `Turncap` (Vector2D), and a String with no default.
  - `CanCombo` in the sheet.
- One behaviour to review, not changed: the switch and Reset appear where the
  default was, so the second click of a double-click lands on them.
  - On the left of the default, over the switch or its label, it flips back. That
    leaves an override equal to the default, with the switch and Reset showing and
    Unapplied changes in the bar. Run on `NoFlinch`.
  - On the middle, over Reset, it removes the override. Run on `CustomFOV`.
  - Further right there is nothing under it (measured, not double-clicked), so the
    first click's value stays.
- Left as they are:
  - The default's tooltip still says "Customize", not the value a click will set.
  - After the click, focus is on the page body, because the button is replaced.
    Read from the code, the old click replaced it the same way.
- Not run: Firefox and Safari.
