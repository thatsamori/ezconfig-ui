# 19: Move feature reviews: Character movement, recovery, stun and free stun

Status: open
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

- [ ] These reviews run through the harness:
      - movement: sprint, crouch direction, equipment, attack duration and
        combined;
      - recovery: feint, parried, stamina, world and combined;
      - stun: duration and combined;
      - free stun.
- [ ] None of them imports the self-hosted config, apply-preview or apply
      routes, or the selective-apply review model.
- [ ] They keep their assertions on value format, keys coexisting, reset to
      game default (the key is gone from the delivered batch), validation and
      command order within the batch. Only selective-apply assertions are
      dropped, and the commit message lists them.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
