# 35: Rulesets

Status: completed
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

- [x] "Save as Ruleset version" creates either version 1 of a new Ruleset or
      the next version (highest + 1) of an existing one, with an optional
      description:
      - it never applies;
      - the new version becomes the Draft's origin;
      - the Draft revision is checked.
- [x] Ruleset names are unique per owner, ignoring case. An owner sees and
      loads only their own Rulesets.
- [x] Loading a version copies its values over the whole Draft, makes it the
      origin and checks the revision:
      - values are placed under their keys' current categories;
      - values whose key or weapon class the schema lacks are dropped, and the
        owner is told how many;
      - nothing goes live until Apply.
- [x] The Draft and the Live configuration each show whether they are
      modified from their origin. Modified compares stored overrides exactly,
      over the keys the current schema has.
- [x] A Ruleset can be renamed. Deleting one removes its versions and clears
      every origin that pointed into them (Drafts and Live configurations) in
      one transaction; the values stay. A single version is never deleted.
- [x] Presets and their tests are removed. The camera policy flow covers
      loading a version instead of importing a preset.
- [x] Route-handler tests cover:
      - saving new and next versions;
      - loading, including the dropped count and category placement;
      - modified;
      - rename with unique names;
      - delete clearing origins;
      - privacy between owners;
      - stale revisions on save and load.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-03: Done on branch `claude/clever-curie-15caf2` (not pushed), on
main `5b62e6a`: commits `6cf2d22`, `77d0c7c` and `cc518c2`. 228 tests pass
across 41 files, typecheck is clean, and lint went from 13 problems to 9 (the
four removed were in preset code). Migration `0009-rulesets.sql`.

- Migration numbers: #33 also took 0008 (`0008-reported-processed-at.sql`),
  and startup refuses gaps or duplicates. #33 merged first, so this branch
  renamed its file to 0009 when it took main at `bd5e1b9`.
- Storage, `0009-rulesets.sql`:
  - `rulesets` (owner, name, `name_key`, created) with a unique index on
    owner and `name_key`. The name is read as a game server name is (trimmed,
    NFC, at most 64 characters); `name_key` is its lower case.
  - `ruleset_versions` (Ruleset, `number` unique within it, description,
    `overrides`, saved). Nothing updates or deletes a version row except
    deleting its Ruleset, which cascades.
  - `drafts.origin_id` and `live_configurations.origin_id` reference a
    version with `ON DELETE SET NULL`. Deleting a Ruleset is one statement:
    the cascade to its versions clears every origin in the same transaction.
- Server, `src/lib/platform/`:
  - `rulesets.ts`:
    - Save as Ruleset version checks the Draft revision, finds or creates the
      Ruleset, inserts version highest + 1 holding the Draft's document as
      stored, and sets the origin, all in one transaction. The description is
      optional, at most 500 characters, and may have line breaks.
    - Load drops values whose key or weapon class the schema lacks
      (`knownValues` in `valuesDocument.ts`, which places the rest under their
      keys' current categories) and replaces the Draft through `loadDraft`.
    - Both are Draft writes through `write`, so the revision rises and a stale
      one gets the usual `staleDraft` 409.
  - Values the schema refuses (a wrong type or range in an old version) are
    loaded, not dropped. The answer lists them as `errors`, the editor marks
    them, Apply is blocked on them, and the next save is refused until they
    are fixed. That is how the camera policy check moved from preset import.
  - `origins.ts`: `originOf` names the Ruleset, the version and `modified`.
    Modified compares the placed fields of both documents with
    `isDeepStrictEqual`, so it is exact and ignores keys the schema lacks.
  - Origin rules:
    - a save keeps the Draft's origin (Modified tells the difference);
    - Reset to game defaults clears it;
    - Apply copies it to the Live configuration;
    - Discard changes copies the Live origin back.
  - Every query is by owner. Another owner's Ruleset or version answers 404,
    the same as one that does not exist.
- Routes:
  - `GET /api/rulesets`.
  - `PATCH` and `DELETE /api/rulesets/[id]`. A taken name answers 409 "You
    already have a Ruleset called X".
  - `POST /api/game-servers/[id]/draft/save-version` with `{revision,
    rulesetId | name, description?}`.
  - `POST .../draft/load` with `{revision, versionId}`, answering `{draft,
    dropped, errors}`.
  - The Draft view, the PUT answer and the game server view carry the
    origins, so Modified stays current after every save.
  - Log events (ids and counts only): `ruleset.version-saved`,
    `ruleset.version-loaded`, `ruleset.renamed` and `ruleset.deleted` (with
    the version `count`).
- Client:
  - The editor's bar has Load Ruleset version and Save as Ruleset version,
    and shows "from <Ruleset> version N" with Modified or Unmodified.
  - The server page shows the Draft origin and the Live origin.
  - The Rulesets tab replaces Presets: versions newest first, with Rename and
    Delete.
  - The store's Ruleset save flushes pending saves first. Load waits for them
    and sets the field errors. A stale answer adopts the current Draft as a
    stale save does. The 3 s refresh also picks up an origin change at the
    same revision (a deleted Ruleset, or a save in another tab).
- Removed:
  - the preset routes (`src/app/api/presets/**`), `src/lib/presets/**`,
    `src/components/presets/**`, the built-in GameDefault manifest, preset
    import and `cameraPolicyValidation.ts`;
  - `presetsPath` in `env.ts`. `PRESETS_PATH` stays in `.env.example` and
    the startup hook, because the parry-geometry migration still reads it
    until #41.
- Tests:
  - `tests/platform-rulesets.test.ts` covers, through the route handlers:
    - saving new and next versions;
    - load, with the dropped count, category placement and refused values;
    - modified for the Draft and the Live configuration;
    - rename with names unique ignoring case;
    - delete clearing Draft and Live origins;
    - privacy, plus session and Origin checks;
    - stale revisions on save and load, two writers included.
  - `tests/config-store.test.ts` replaces the preset test with four Ruleset
    store tests.
  - The camera policy flow saves and loads versions in place of preset
    import.
- Hand check, `bun --bun next dev` on a temp database at port 3435, as Ann
  and Bob:
  - Save made Competitive v1; an edit showed Modified in the bar; v2 saved.
  - A save from a second tab on the old revision was refused: the tab took
    the other tab's value and kept the dialog open. Saving again made v3, and
    the first tab's origin followed within 3 s.
  - Loading a version written straight into the database with an unknown key
    and weapon class into Duel NA gave "2 values were dropped", with the
    known value under Movement and Unmodified.
  - A new Ruleset called "competitive" and a rename to "COMPETITIVE" were
    both refused. Rename to Competitive EU worked.
  - Deleting it cleared both Drafts' origins and a Live configuration's
    origin (a row written straight into the database, because Apply needs a
    connected server). Values and revisions stayed.
  - Bob got an empty list, 404 on loading, saving into, renaming or deleting
    Ann's Ruleset, and could use the name "casual" himself.
  - Two fixes came out of it (`cc518c2`): the bar's origin truncates the
    name before the Modified tag, and the row buttons carry the Ruleset's
    name.
- Left for others:
  - #40: moving existing presets into Rulesets. Insert into `rulesets` and
    `ruleset_versions` (owner, `name_key`, number from 1) and, if a Draft
    should point at one, set `drafts.origin_id`. Version documents use the
    values-document shape.
  - #41: `jszip` is no longer imported anywhere and can leave
    `package.json`, along with `PRESETS_PATH`.
- In the hand check, `/api/notes` answered 500 with "Failed to load external
  module postcss-…". That is the dev-server quirk #36 recorded (a fresh
  `NEXT_BUILD_DIR`; a restart fixes it, and `next build` is fine), not a
  Rulesets problem.
