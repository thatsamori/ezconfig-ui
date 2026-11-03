# 21: Move feature reviews: weapons, camera policy and the rest

Status: open
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

- [ ] The weapon feature reviews run through the harness: attack, general,
      integration, roster and windup.
- [ ] The camera policy flow's editor-and-apply part runs through the harness.
      Its preset-import part stays until [Rulesets](35-rulesets.md) replaces
      presets.
- [ ] A search of the tests finds no other fixture that drives the
      self-hosted config, apply-preview or apply routes to check a feature.
- [ ] Value-format, roster, validation and command-order assertions are kept.
      Only selective-apply assertions are dropped, and the commit message
      lists them.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
