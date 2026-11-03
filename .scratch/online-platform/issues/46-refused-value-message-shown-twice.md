# 46: A refused value's message shows twice

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

When the editor marks a value the schema refuses, its message appears twice
under the field. One copy comes from the value editor
(`src/components/console/ValueEditor.tsx:44`), the other from the key row
(`src/components/console/ConfigConsole.tsx:77`).

This was found by the check of `main` at `f8ec3b1`, after
[A Live configuration the schema refuses](44-live-configuration-the-schema-refuses.md)
merged. #44 noted the same doubling after a refused save, before its change.

To reproduce: open Edit Draft on a Blocked game server and go to the Camera
group. The check's write-up, `check-main-f8ec3b1.md` in the shared notes
folder, has screenshots.

Not part of this ticket: while two values are refused, fixing the first one
still shows "Not saved" naming the second. The Draft is saved whole, so that
is expected.

## Acceptance criteria

- [x] A refused value shows its message once, both when a Draft opens with
      marks and after a refused save.
- [x] Every other place that shows a value's error still shows it, checked
      in a browser.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/nervous-archimedes-7888b5` (not pushed), after
[Every value edits the same way](49-every-value-edits-the-same-way.md). 233
tests pass across 44 files, typecheck is clean, and lint stays at 5. No
migration.

- The key row no longer shows the message. It passes the Draft's mark to
  `ValueEditor` as `error`, and the editor shows one message per value. On a
  number field, what the field holds comes first and the mark after it. This
  also ends a case the ticket did not name: typing another refused value over a
  marked one showed the old mark and the new message together.
- Keeping the field's own check means a value refused while typing still says so
  at once, before any save. The All weapons sheet has no marks, so it relies on
  the same check.
- The number field's message was an unstyled `span` beside the input. It now uses
  `.field-error` under the field and its Reset, and Reset stays beside the input.
  Those rules are in `globals.css`.
- `tests/value-editor.test.tsx` counts the alerts for each kind of value.
- Checked by hand on the built app (`next start`) on a temp database at
  `127.0.0.1:3549`, with a made-up owner and game servers. Blocked was made the
  fixture's way: `UPDATE live_configurations/drafts SET overrides`.
  - A Draft opening with marks, on a Blocked game server: `CustomFOVMax` 120.5
    shows "Use a whole number." once, between the field and the default caption,
    and `FreeStunDuration` -1 shows its message once.
  - After a refused save: fixing `CustomFOVMax` to 130 gives the expected "Not
    saved" naming `FreeStunDuration`. Its row shows the message once and the fixed
    row shows none. Fixing it to 1 saves and clears the last message.
  - Typing 500 over the marked 120.5 shows only "Use a finite value from 101 to
    179."
  - Every other place: the Blocked box and the Apply review (both values named,
    Apply disabled), the "Not saved" status line and toast. Marks on a Draft
    with `CustomFOV` "yes", `MaxWalkSpeed` "fast" and
    `HighBlockColliderRelativeOffsetLocation` "nowhere" each show once, under the
    switch, the empty number field and the vector.
- Left as it was: after the field holds a valid value, its old mark stays until
  the save answers (the debounce and the request), as it did in the key row.
