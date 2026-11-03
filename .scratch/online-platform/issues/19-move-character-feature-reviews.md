# 19: Move feature reviews: Character movement, recovery, stun and free stun

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 18
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A migrate batch of the wide refactor started in
[Feature review harness](18-feature-review-harness.md). The remaining Character
feature reviews for movement, recovery, stun and free stun drive their features
through the harness instead of calling the self-hosted config, preview and
apply routes directly. Each keeps what it proves about its feature.

## Acceptance criteria

- [x] These reviews run through the harness:
      - movement: sprint, crouch direction, equipment, attack duration and
        combined;
      - recovery: feint, parried, stamina, world and combined;
      - stun: duration and combined;
      - free stun.
- [x] None of them imports the self-hosted config, apply-preview or apply
      routes, or the selective-apply review model.
- [x] They keep their assertions on value format, keys coexisting, reset to
      game default (the key is gone from the delivered batch), validation and
      command order within the batch. Only selective-apply assertions are
      dropped, and the commit message lists them.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op19-character-reviews-2dce94` (not pushed).

- All 13 fixtures run through `tests/fixtures/feature-review-harness.ts`
  and check the delivered batch with `categoryEntries`/`categoryCommands`.
  No harness change.
- Each commit message lists the selective-apply assertions its fixtures
  dropped, and what they kept.
- The capture files keep their own shapes, written from the batches
  `apply` returns: movement combined, stun duration and free stun as
  before, minus the review rows. Stun combined runs each delivered batch
  through the real batch sender against its controlled result exchange,
  so its `captures` still have commands, frames, wire and result. Its
  two hand-written batches (`mixed-known-unknown`, `mixed-late-failure`)
  go straight to the sender instead of the apply route.
- Mod-side follow-up: the free stun replay scripts read the stun
  combined mode `selected-distinct-durations`, which is gone. The new
  `distinct-durations` stage (the same three durations, Apply
  everything after a wipe, 8 accepted) is there to replace it.
