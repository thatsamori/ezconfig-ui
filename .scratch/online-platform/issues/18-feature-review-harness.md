# 18: Feature review harness

Status: open
Type: task
Created: 2026-11-02
Blocked by: None
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

The expand step of a wide refactor. About 30 feature review fixtures
(movement, recovery, stun, parry, geometry, weapons, camera policy and others)
each drive the editor store, the self-hosted config routes, the apply preview
and a mocked RCON apply, then check what reaches the server.

[Edit a game server's Draft](30-edit-a-game-servers-draft.md) and
[Apply a Draft and deliver it](32-apply-a-draft-and-deliver-it.md) replace
those routes. Done directly, that would break every fixture at once, and lose
the only per-feature check of the command format the mod reads.

This ticket adds one shared harness whose interface is shaped like the
platform:
- set and reset values through the editor store;
- Apply everything;
- capture the delivered batch (a wipe, then one command per non-empty
  category, in today's command encoding);
- simulate the mod's success report.

For now the harness runs on today's routes, applying the whole configuration
with a wipe and RCON mocked. Later tickets switch what it runs on, without
changing the fixtures. One fixture moves onto it here, as proof.

## Acceptance criteria

- [ ] The harness lets a fixture set a value, reset a value to the game
      default, read back a saved value, and Apply everything. Apply returns
      the delivered batch as a wipe followed by one command per non-empty
      category.
- [ ] There is no selective apply: every Apply sends the whole configuration
      after a wipe, as the platform will.
- [ ] Each fixture gets isolated temp storage. Nothing real is touched, and
      RCON stays mocked.
- [ ] An option writes the delivered batch to a capture file, so the existing
      command-capture hooks used for mod evidence keep working.
- [ ] The Character movement walk review is moved onto the harness. Its
      selective-apply assertions are dropped, and its value-format,
      coexistence and reset assertions are kept.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
