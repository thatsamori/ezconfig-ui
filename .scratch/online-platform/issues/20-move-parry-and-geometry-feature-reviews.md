# 20: Move feature reviews: parry, geometry, attack motion and base parry

Status: open
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

- [ ] These reviews run through the harness:
      - parry: angles, detector, timing and combined;
      - base parry;
      - attack motion;
      - geometry: review, components and combined;
      - bubble components.
- [ ] None of them imports the self-hosted config, apply-preview or apply
      routes, or the selective-apply review model.
- [ ] They keep their assertions on value format, keys coexisting, reset to
      game default, validation and command order. Only selective-apply
      assertions are dropped, and the commit message lists them.
- [ ] The geometry combined review's check of the parry-geometry startup
      migration stays on that migration. It is removed with the migration in
      [Remove the self-hosted mode](41-remove-the-self-hosted-mode.md).
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
