# 21: Move feature reviews: weapons, camera policy and the rest

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 18
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The last migrate batch of the wide refactor started in
[Feature review harness](18-feature-review-harness.md). The weapon feature
reviews, the camera policy flow, and any other fixture that saves through the
editor and checks what an apply sends now run through the harness.

Afterwards, the only tests that still call the self-hosted config or apply
routes are the ones that test those routes, or RCON, automatic sync or the
parry-geometry migration. Later tickets replace or delete those along with the
code.

## Acceptance criteria

- [x] The weapon feature reviews run through the harness: attack, general,
      integration, roster and windup.
- [x] The camera policy flow's editor-and-apply part runs through the harness.
      Its preset-import part stays until [Rulesets](35-rulesets.md) replaces
      presets.
- [x] A search of the tests finds no other fixture that drives the
      self-hosted config, apply-preview or apply routes to check a feature.
- [x] Value-format, roster, validation and command-order assertions are kept.
      Only selective-apply assertions are dropped, and the commit message
      lists them.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op21-weapon-remaining-reviews-3a0492`
(not pushed). 163 tests pass, typecheck is clean, and lint is down from 25
to 24 (the old general review's unused `weapons` is gone).

- Each move is its own commit, and its message lists the selective-apply
  assertions it dropped. The weapon reviews save under the bare weapon
  name (`ArmingSword`), as the editor does.
- The roster check now reads `CategoryName` directly. That is the list
  the console sorts and storage routes by, so no moved review imports the
  selective-apply review model.
- Harness, additive only: `editorValue(database, category, key)` returns
  the editor's in-memory value, so the reviews can check that a refused
  edit leaves the shown value alone (weapon lengths, camera FOV).
  `harness-check` covers it.
- Camera policy is now two fixtures. `camera-policy-review.ts` runs the
  editor and Apply on the harness. `camera-policy-flow.ts` keeps three
  things that are not editor saves: the routes refusing hand-made input
  (a `null` in a whole-category write; Camera commands sent directly to
  apply), presets until [Rulesets](35-rulesets.md), and automatic
  startup and requestupdate sync over TCP with the strict build. Its own
  applies are now full ones.
- Left alone, and why. Each tests a route, the review model, RCON,
  automatic sync or the parry-geometry migration, not a feature:
  - `console-api.test.ts`: the apply and bulk-weapons routes themselves.
  - `console.test.ts`: unit tests of the selective-apply review model.
  - `batch-apply-review.ts`: the apply route with the acknowledged batch
    protocol, its failure modes and apply history.
  - `config-collaboration.ts`: the config, revision, overrides, clear and
    bulk-weapons routes.
  - `config-sync.test.ts`: the store's sync client against mocked routes.
  - `automatic-sync.test.ts`, `automatic-sync-next-probe.ts`: automatic
    sync.
  - `parry-migration-*.ts`: the parry-geometry migration.
  - The movement, recovery, stun and free-stun reviews belong to
    [19](19-move-character-movement-recovery-and-stun-reviews.md). The
    parry, base parry, attack motion, geometry and bubble reviews belong
    to [20](20-move-parry-geometry-and-attack-motion-reviews.md).
- Captures keep their env vars, files and keys, but every stage is now a
  whole delivered batch that starts with the wipe. There are two
  exceptions. `EZ_WEAPON_CAPTURE_PATH` has no `selected` stage any more:
  attack has `initial` and `afterRemoval`; integration has `initial`,
  `updated` and `afterRemoval`. The camera review writes to
  `EZ_CAMERA_REVIEW_CAPTURE_PATH`. The committed captures in
  `.scratch/weapon-*-ui/` were not regenerated.
- Mod-side follow-up (from 18): some replay scripts read a stage that
  used to be selective, so they need updating before anyone re-captures.
  `builders/test_weapon_attack_ui_replay.py` and
  `test_weapon_integration_ui_replay.py` read `selected`.
  `test_weapon_rearing_contract_pie.py`,
  `test_weapon_general_combined_pie.py`, `test_weapon_roster_pie.py` and
  `.scratch/weapon-scale/combat_ui_replay.py` will now get a whole batch
  where they used to get only the selected commands, and the rearing
  `before` batches now start with a wipe too.
