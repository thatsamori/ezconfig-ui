# 55: A Ruleset name can stretch the page or hide what it is

Status: open
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Found by the check of `main` at `9f3df3a`. Its write-up is
`check-main-9f3df3a.md` in the shared notes folder. A Ruleset name can now arrive
in someone else's file ([#54](54-export-and-import-rulesets-as-files.md)), so an
owner can get one without typing it.

- A long unbroken name breaks the layout. Import a file named 64 W's:
  - Every `.ruleset-card` stretches, up to 1252 px, with a sideways scrollbar
    below about 1260. `.ruleset-card h2` doesn't wrap, though the description
    does.
  - `.origin-name` on the game server page does the same.
  - In the import dialog, a long unbroken name that is already taken widens
    `.dialog-error`, and Cancel and Import sit outside the dialog. Escape and ×
    still work.
- Names can hold invisible or direction-changing characters (`\p{Cf}` passes).
  `abc‮gnp.exe` displays flipped, and U+202E or U+200B alone gives a name that
  looks blank. Filenames stay safe. `readRulesetName` uses the game server name
  rule, `readGameServerName`, so a change there covers both.
- A lone surrogate in a file's name merges with the next character.

## Acceptance criteria

- [ ] A long unbroken name wraps on the Rulesets page, on the game server page and
      in the import dialog, with no sideways scrollbar at 320 px to 1280 px.
- [ ] A name holding invisible or direction-changing characters is refused or
      cleaned on create, rename and import, for Rulesets and game servers. An
      emoji that uses a joiner still works, or the ticket says why it doesn't.
- [ ] A name that holds nothing visible is refused.
- [ ] Names already stored still display and can be renamed.
- [ ] Checked in a browser.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
