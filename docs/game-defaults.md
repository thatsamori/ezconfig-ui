# Actual defaults

The UI uses a checked-in snapshot, so it needs no game connection to display defaults.
`src/lib/config/gameDefaults.json` was extracted from the Mordhau SDK on 2026-09-08.
It covers 170 character keys and 35 weapons, with separate General, Strike,
AltStrike, Stab and AltStab values. `sources` records the weapon assets and the
actual attack/parry motion classes referenced by stock runtime animation profiles.
Unused SDK test motions are excluded.

Schema entries expose `defaultValue` for one verified base value,
`defaultVariants: [{ value, contexts }]` for motion-dependent values, or
`defaultValues[weapon][category]` for weapon fields. `defaults.ts` attaches the
snapshot metadata and resolves the appropriate cell. New options can declare
this metadata directly in their schema; the coverage test fails if it is missing.
The old `default` property remains for compatibility and is not used for display.

These are base defaults, not a prediction of a living player's effective stats.
Perks, armor, equipment, game modes and other runtime modifiers can change them.
Feature parameter defaults are the mod's fallback values when that feature is on.
Motion-dependent settings show their values with context details in the tooltip.
Reset continues to delete the override; defaults are never saved or sent merely
because they were displayed. Existing explicit-input safeguards remain in place.

To refresh in bulk (normally unnecessary):

1. In the UI repo, run `bun scripts/export-default-schema.ts <mod>/.scratch/ui-defaults/schema.json`.
2. Follow the mod/SDK agent operating manual, then run `python uexec.py builders/session_start.py`
   and `python uexec.py builders/export_ui_defaults.py` in the mod repo.
3. In the UI repo, run `bun scripts/import-game-defaults.ts <mod>/.scratch/ui-defaults/extracted.json`.
4. Run `bun test ./tests`, `bunx tsc --noEmit`, and the mod's `python builders/check_contract.py`.

The extractor is read-only: no Blueprint creation, graph edits, PIE or asset saves.
It follows character movement aliases, transform components, attack structs and
motion-rule metadata. `Turncap` reads `TurnCaps`; the UI's `HitKnockbackFactor`
reads the native misspelled `HitKockbackFactor`. This documents the native base
even though that option's dispatch remains unimplemented. Floating-point values
are rounded to six decimal places for display; rotation conversion can retain
small quaternion-to-Euler rounding differences.
