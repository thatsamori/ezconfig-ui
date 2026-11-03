# 49: Every value edits the same way

Status: open
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

- [ ] Clicking `PartialSprintModifier`'s default opens an input holding 1.175,
      selected, and typing replaces it. No Use value button remains.
- [ ] A cell whose default varies opens empty, and typing a value there saves
      as elsewhere.
- [ ] On every Float key: Enter saves, blur saves a changed value, blur on
      unchanged or empty text leaves no override and no Unapplied change, and
      Escape discards.
- [ ] A value outside a key's range is still refused, with its message.
- [ ] The feature reviews pass, and the string schemas are unchanged.
- [ ] Checked in a browser on Movement, attack motion and ordinary keys, and in
      the All weapons sheet.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
