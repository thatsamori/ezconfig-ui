# 56: A vector with an extra field can't be fixed by typing

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Found by the check of `main` at `9f3df3a`. Its write-up is
`check-main-9f3df3a.md` in the shared notes folder.

The stricter value rules from
[#54](54-export-and-import-rulesets-as-files.md) refuse a stored vector with a
field it shouldn't have. To reproduce, store `{x,y,z,w}` in a Draft, type 5 in X
and press Enter. The field shows 5, the toast says "Not saved: ... Expected
Vector, got Object", and the Draft doesn't change.

`ValueEditor.tsx` (about line 139) spreads the old value, which keeps the extra
field, so every edit is refused. Only Reset clears it, though the page says to fix
it and the axes look fine.

This arises only if such a value is stored. A read-only count of the live database
on 2026-11-03 found none.

## Acceptance criteria

- [ ] Typing an axis of a stored vector with an extra field saves a vector holding
      only its own axes.
- [ ] Editing an ordinary vector works as it did.
- [ ] Checked in a browser, on a temp database.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
