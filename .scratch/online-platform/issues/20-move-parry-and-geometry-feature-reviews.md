# 20: Move feature reviews: parry, geometry, attack motion and base parry

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 18
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A migrate batch of the wide refactor started in
[Feature review harness](18-feature-review-harness.md). The parry, geometry,
attack motion and base parry feature reviews drive their features through the
harness instead of calling the self-hosted config, preview and apply routes
directly.

## Acceptance criteria

- [x] These reviews run through the harness:
      - parry: angles, detector, timing and combined;
      - base parry;
      - attack motion;
      - geometry: review, components and combined;
      - bubble components.
- [x] None of them imports the self-hosted config, apply-preview or apply
      routes, or the selective-apply review model.
- [x] They keep their assertions on value format, keys coexisting, reset to
      game default, validation and command order. Only selective-apply
      assertions are dropped, and the commit message lists them.
- [x] The geometry combined review's check of the parry-geometry startup
      migration stays on that migration. It is removed with the migration in
      [Remove the self-hosted mode](41-remove-the-self-hosted-mode.md).
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op20-parry-geometry-reviews-2e30b9` (not pushed).

- All ten reviews call `featureReview` and import no route or review model.
  Each commit lists the selective-apply assertions it dropped, and what
  changed besides.
- Harness change, additive: its RCON mock also serves
  `executeAcknowledgedBatchAt`, and `synced()` returns what the automatic
  sync delivered on its own. The geometry combined review needs it for the
  real startup snapshot. It can go in
  [41](41-remove-the-self-hosted-mode.md) with the migration check.
- The attack motion review had no test running it. `tests/attack-motion.test.ts`
  now runs it.
- Geometry review checks the editor's refusals with `saved()`, as the
  harness's own check does, not with the editor's in-memory value.
- Mod-side follow-up: the geometry-rules ticket06 replay scripts read the
  combined capture's `selected-all-five-update` stage, which is gone. They
  need `updated-all`. The components captures lose their `select-only-*`
  rows, and the geometry capture's cases lose `review`. No mod script reads
  either.
- For [30](30-edit-a-game-servers-draft.md): the combined review's startup
  part migrates and syncs the self-hosted storage files, so it still needs
  those files until 41 removes it.
