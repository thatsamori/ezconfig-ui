# 50: The mouse wheel changes an open value

Status: open
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

- [ ] With a number field focused and the pointer over it, the wheel scrolls the
      page and leaves the value unchanged. Check a new value's input, an
      overridden value, a vector axis and an array value, and the All weapons
      sheet.
- [ ] Typing and the arrow keys still work in those fields.
- [ ] Checked in a browser.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
