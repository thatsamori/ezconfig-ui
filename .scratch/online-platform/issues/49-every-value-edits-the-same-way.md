# 49: Every value edits the same way

Status: completed
Type: task
Created: 2026-11-03
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The owner's report, from testing V1: some values need an extra click on Use
value after editing, and those values don't fill in the game default when
clicked.

What happens now (`main` at `08b1e59`), in `src/components/console/ValueEditor.tsx`:
- Most Float keys: clicking the default opens an input holding it. Blur or
  Enter saves.
- The 13 Movement keys (`requiresExplicitValue`) and the attack motion, base
  parry and recovery keys (`defaultVariesByMotion`): clicking the default opens
  `ExplicitFloatOverride`, which starts empty and saves only on Use value or
  Enter.

The second editor was a deliberate choice. The mod's
`.scratch/movement-rules/spec.md` (about line 204) says "Customize must not
create an override; Use value/Enter saves, Cancel/Escape discards, blur does not
commit, and Reset removes the override". At that time Movement's defaults
weren't verified, and in the self-hosted app a save could reach the server
straight away. Neither holds now:
- Every Movement key shows a default from the snapshot, such as
  `PartialSprintModifier` at 1.175.
- `resolveDefault` gives most cells of the other keys a single default.
- Nothing reaches a game server until Apply.

Build one editor for every Float key, keeping the part of that rule that still
matters: looking at a value must not create an override.
- Clicking the default opens the input holding the cell's default, selected so
  typing replaces it. A cell with no single default (it varies, or is
  unavailable) opens empty.
- Enter saves, even an unchanged default, since pressing it is deliberate.
- Blur saves a changed value. Blur on unchanged or empty text creates no
  override.
- Escape discards.
- A value outside a key's range is refused as it is today.

The blur rule also changes the other Float keys. Today, clicking one's default
and clicking away creates an override equal to the default, which shows as an
Unapplied change.

Remove `ExplicitFloatOverride`. Only `ValueEditor` reads `requiresExplicitValue`
and `defaultVariesByMotion`, so remove them from the schemas too, with the test
assertions on them. Key names and the string schemas don't change, so this is
not a contract change with the mod.

[A refused value's message shows twice](46-refused-value-message-shown-twice.md)
touches the same file.

## Acceptance criteria

- [x] Clicking `PartialSprintModifier`'s default opens an input holding 1.175,
      selected, and typing replaces it. No Use value button remains.
- [x] A cell whose default varies opens empty, and typing a value there saves
      as elsewhere.
- [x] On every Float key: Enter saves, blur saves a changed value, blur on
      unchanged or empty text leaves no override and no Unapplied change, and
      Escape discards.
- [x] A value outside a key's range is still refused, with its message.
- [x] The feature reviews pass, and the string schemas are unchanged.
- [x] Checked in a browser on Movement, attack motion and ordinary keys, and in
      the All weapons sheet.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/nervous-archimedes-7888b5` (not pushed), with
[A refused value's message shows twice](46-refused-value-message-shown-twice.md)
after it. 226 tests pass across 43 files, typecheck is clean, and lint stays at
5. Regenerating the string schemas changes nothing. No migration.

- One editor, in `ValueEditor.tsx`. The rule is `newValueOutcome` in
  `console/model.ts`, with tests in `tests/console.test.ts`.
  `ExplicitFloatOverride`, `requiresExplicitValue` and `defaultVariesByMotion`
  are gone, with the assertions on them. Four test names that said "explicit"
  for the flag are reworded.
- `typingValue` in `ConfigConsole.tsx` no longer looks for a `form`: the old
  editor's was the only one in the table.
- Decided where the ticket left it open:
  - The new value's input now shows a refused value's message. It only marked
    the field before, so a refused value there gave no reason.
  - A refused value stays open on blur and on Enter, as it did on blur. Escape,
    or clearing the text and leaving, closes it.
  - Enter on empty text closes with no override, as blur does.
  - Unchanged compares numbers, so `1.1750` over a default of 1.175 is unchanged.
  - In the All weapons sheet, Escape in the new value's input closed the whole
    sheet, because Radix takes the key first. It now discards only the value,
    and a second Escape closes the sheet (`SweepPanel.tsx`).
- Checked by hand on the built app (`next start`) on a temp database at
  `127.0.0.1:3549`, with a made-up owner signed in with `signInForTest` and a
  script polling for one game server.
  - `PartialSprintModifier`: opens holding 1.175 with the text selected, and
    typing replaces it. Blur unchanged and blur empty leave 0 overrides and
    "Nothing applied yet". Enter unchanged saves 1.175 as an override with
    Unapplied changes. Blur on 1.25 saves. Escape discards. No Use value or
    Cancel button in the page.
  - Attack motion `StrikeChamberWindow` (varies): opens empty, with "type a
    value". Blur and Enter on empty leave no override, Escape discards, and
    Enter on 0.2 saves. `StrikeFeintWindow` (varies): blur on 0.1 saves.
  - Ordinary keys: `MissStaminaCost` on ArmingSword Strike, opens holding 6.
    Blur unchanged leaves no override, Escape discards, Enter saves.
    `WorldRecoveryTime` (Recovery): opens holding 0.5, and blur leaves no
    override.
  - Range: `CustomFOVMax`. 500 and 120.5 show their messages and stay open on
    Enter and blur, with no save. Escape closes, and Enter on 130 saves.
  - All weapons sheet: `MorphCost` (7 on every weapon) opens holding 7. Blur
    unchanged leaves 0 changes, and blur on 9 gives 35. `MissRecovery` (varies)
    opens empty. Blur empty leaves 0 changes, Enter on 0.55 gives 35, and Escape
    behaves as above. No weapon key with a range has an All weapons link, so no
    refused value can reach the sheet's input.
  - The Draft refresh: with text typed in the input, no `GET .../draft` went out
    for 7 s, and another tab's save stayed out of the page. After Escape the
    next refresh took it, and `StrafeModifier` showed that save's 0.5.
- Not changed: the mod's `.scratch/movement-rules/spec.md` (about line 204)
  still states the old rule. It is in the mod repo, so this branch leaves it.
- Found, not fixed: the Character sidebar says "1 overrides"
  (`ConfigConsole.tsx`, `sidebar-title`).
