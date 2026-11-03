# 35: Rulesets

Status: open
Type: task
Created: 2026-11-02
Blocked by: 32
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

A server owner saves a game server's Draft as a Ruleset version and loads any
version into any of their game servers' Drafts. Ruleset versions are
immutable and numbered within their Ruleset, and Rulesets are private. The
owner can see whether a Draft or Live configuration is modified from its
origin, rename a Ruleset, or delete it with all its versions.

The change is made in place. Presets (their routes, service and tab, built-in
presets and preset import) are removed. The camera policy flow's
preset-import check moves to loading a Ruleset version.

## Acceptance criteria

- [ ] "Save as Ruleset version" creates either version 1 of a new Ruleset or
      the next version (highest + 1) of an existing one, with an optional
      description:
      - it never applies;
      - the new version becomes the Draft's origin;
      - the Draft revision is checked.
- [ ] Ruleset names are unique per owner, ignoring case. An owner sees and
      loads only their own Rulesets.
- [ ] Loading a version copies its values over the whole Draft, makes it the
      origin and checks the revision:
      - values are placed under their keys' current categories;
      - values whose key or weapon class the schema lacks are dropped, and the
        owner is told how many;
      - nothing goes live until Apply.
- [ ] The Draft and the Live configuration each show whether they are
      modified from their origin. Modified compares stored overrides exactly,
      over the keys the current schema has.
- [ ] A Ruleset can be renamed. Deleting one removes its versions and clears
      every origin that pointed into them (Drafts and Live configurations) in
      one transaction; the values stay. A single version is never deleted.
- [ ] Presets and their tests are removed. The camera policy flow covers
      loading a version instead of importing a preset.
- [ ] Route-handler tests cover:
      - saving new and next versions;
      - loading, including the dropped count and category placement;
      - modified;
      - rename with unique names;
      - delete clearing origins;
      - privacy between owners;
      - stale revisions on save and load.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
