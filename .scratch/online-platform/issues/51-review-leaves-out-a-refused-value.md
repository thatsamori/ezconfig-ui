# 51: The review leaves out a refused value without saying so

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Found by the check of `main` at `d04dfcb`. Its write-up is
`check-main-d04dfcb.md` in the shared notes folder.

A value the input refuses never reaches the Draft. The review is right about the
Draft, but an owner reads it as being about what they just typed.

To reproduce: in Camera, click the `CustomFOVMax` default, type 500 and click
Apply to game server. The review says "No changes" and that the configuration
will be sent again, with Apply enabled. It doesn't mention the typed value it
left out.

The bar has the same gap: it says "Matches the Live configuration" while a row
holds a refused, unsaved value, though the "Not saved" line explains it.

## Acceptance criteria

- [x] While a field holds a refused value, Apply to game server says so, naming
      the key, instead of a review that reads as if nothing is wrong. The owner
      can fix or discard the value and go on.
- [x] The bar doesn't say the Draft matches the Live configuration while a field
      holds a refused value.
- [x] A review with no refused value open is unchanged.
- [x] Checked in a browser.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/competent-jang-af370b` (not pushed), on main
`a55cda5`. 247 tests pass across 45 files, typecheck is clean, and lint stays at
5. No migration.

- How the bar learns of a refused value: while a field in the Draft holds one,
  `ValueEditor.tsx` adds it to the store's `refused` list with `holdRefused`. It is
  taken off when the value is fixed or discarded, or the field goes away, as when
  the owner moves to another group. The All weapons sheet's value is not in the
  Draft, so it is not added.
- The review, `ApplyDialog.tsx`: at the top, "Refused, so not in the Draft: fix or
  discard before you Apply", then each value's place, key, typed text and message.
  - Apply is disabled while any is listed.
  - Focus starts on Cancel, so Enter goes back to the field.
  - "Discard this value" (or "these values") puts each field back as it was
    without writing to the Draft, so the review stays valid and Apply is enabled.
    It needed a `reset` on `useDebouncedCallback`.
- The bar: "1 refused value" in red, with the count from `refusedCount`.
- Three behaviours to review:
  - The count includes the platform's marks as well as typed values, with a field
    that has both counted once. So a Draft that opens holding values the schema
    refuses now reads "2 refused values" instead of Matches or Unapplied changes,
    and so does a refused save.
  - The bar says this in place of Unapplied changes and Nothing applied yet too,
    not only in place of Matches. The criteria only ask for Matches.
  - Typing a valid value into a limited key passes through refused text: 1 and 13
    on the way to 130. The bar shows "1 refused value" for those keystrokes, as the
    field's own message already does.
- Checked by hand on the built app, set up as in
  [#50](50-mouse-wheel-changes-an-open-value.md):
  - The ticket's steps. `CustomFOVMax` default, 500, Apply to game server: the bar
    and the review name it, and Discard, then Apply, works.
  - Cancel, fix to 150 and Apply: "Added (1)", reported by the script, Confirmed in
    the bar.
  - 500 over an override: Discard goes back to 130, and the Draft's revision does
    not move.
  - An emptied field shows "Enter a value." Two at once (Stun): "2 refused values"
    and "Discard these values". Moving to another group clears it.
  - Values written straight into the temp database's Draft, as a deploy that
    tightened keys would leave them (`CustomFOVMax` 120.5, `FreeStunDuration` -1).
    Bar "2 refused values". 500 typed over the first is still 2, and the review
    lists the typed value and "Fix these values". Discard goes back to the mark. A
    refused save reads "1 refused value" with the "Not saved" line. After fixing
    both: "Changed (2)", Applied, Confirmed.
  - A review with no refused value is unchanged, and Apply has focus.
  - 420 and 1280 px: no overflow, and the Apply button's box does not move between
    "1 refused value" and Matches.
  - Console: no CSP violation. The only errors were my own 400 and 409, a 401
    before sign-in, and refused connections while I restarted the app. Server log:
    no errors.
- Not run: a refused value on a first Apply, or a weapon's limited key
  (`WeaponLength`); the code path is the same. Firefox and Safari were not run.
- Left as they are:
  - After Discard, focus is on the dialog, not a control; Tab reaches Cancel.
  - After the review closes, focus is on the page body, as it was before.
  - Save as Ruleset version with a refused value open also leaves it out without
    saying so. Read from the code, not run, and outside this ticket.
