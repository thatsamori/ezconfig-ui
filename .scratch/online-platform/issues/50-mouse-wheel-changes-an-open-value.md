# 50: The mouse wheel changes an open value

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Found by the check of `main` at `d04dfcb`. Its write-up is
`check-main-d04dfcb.md` in the shared notes folder.

A number input opened from a default sits under the pointer, so the next wheel
notch changes the value instead of scrolling the page. Clicking away then saves
it.

To reproduce: in Character > Movement, click the `PartialSprintModifier` default
(1.175), roll the wheel down one notch, then click the page heading. An override
of 0.175 is stored and the bar says Unapplied changes.

The change still needs Apply and shows in the review, so it can't reach a game
server unseen. Ordinary Float keys already had this input and its blur save.
[Every value edits the same way](49-every-value-edits-the-same-way.md) extended
them to the Movement and varying keys, so more values are exposed now.

Cover every number field in the editor: the new value's input and `NumberField`
in `src/components/console/ValueEditor.tsx`, wherever they appear.

## Acceptance criteria

- [x] With a number field focused and the pointer over it, the wheel scrolls the
      page and leaves the value unchanged. Check a new value's input, an
      overridden value, a vector axis and an array value, and the All weapons
      sheet.
- [x] Typing and the arrow keys still work in those fields.
- [x] Checked in a browser.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/competent-jang-af370b` (not pushed), on main
`a55cda5`. 247 tests pass across 45 files, typecheck is clean, and lint stays at
5. No migration.

- The fix is `holdNumberForWheel` in `src/components/console/model.ts`. While the
  wheel event is handled, the focused number input is read-only, so the browser
  skips the step and scrolls as usual. It is editable again on the next task. It
  keeps its focus, its selection and what it holds.
- `ConfigConsole.tsx` adds one `wheel` listener on the document, so every number
  input is covered, including those in dialogs and any added later. That includes
  the All weapons sheet's "Treat untouched as" input, which this ticket did not
  name.
- Other ways it could have been done, and why not:
  - `blur()` would close a new value's input or save what was typed, just from
    scrolling.
  - `preventDefault()` also stops the scroll, so the code would have to find the
    scroller and scroll it, losing the browser's own scrolling.
- Checked by hand on the built app (`next start`) on a temp database at
  `op50.localhost:3550`, in the browser pane (Chromium), with real wheel events. A
  made-up owner signed in with `signInForTest`, and a script polled for one game
  server.
  - Reproduced first on the unchanged build: `BackpedalModifier` 0.8 went to -0.2
    on one notch, and the page did not scroll.
  - With the fix, the wheel scrolled the page 100 px per notch and the value did
    not change. Checked on: a new value's input (just opened and after typing), an
    overridden value (`PartialSprintModifier`), a vector axis, and an array value.
  - In the All weapons sheet the value did not change in the sheet's value, its
    new value's input (empty and after typing) and "Treat untouched as". Nothing
    scrolls under those inputs, so the sheet stays where it is. The list below
    them has its own scrollbar.
  - The arrow keys step, and typing works, in the fields above except "Treat
    untouched as" and the sheet's new value's input, where only typing was tried.
  - The stored Draft had the same values after the checks: no override from the
    wheel.
- Not run: Firefox and Safari, and Ctrl+wheel zoom over a focused field.
